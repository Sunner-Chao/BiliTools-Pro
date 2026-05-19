import React, { useEffect, useRef, useState } from 'react';
import { Button, Card, Col, DatePicker, Divider, Form, Input, InputNumber, message, Row, Select, Space, Switch, Tag, Typography } from 'antd';
import { CheckCircleOutlined, FolderOpenOutlined, LoadingOutlined, ReloadOutlined, StopOutlined, VideoCameraOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { startStreaming as startStreamAction, stopStreaming as stopStreamAction } from '../store/slices/streamingSlice';

const STREAMING_FORM_KEY = 'bilitools_streaming_form';

const StreamingPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const streaming = useAppSelector((state) => state.streaming);
  const user = useAppSelector((state) => state.auth.user);
  const [form] = Form.useForm();
  const [status, setStatus] = useState<any>({ logs: [] });
  const [loading, setLoading] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const loadStatus = async () => {
    const result = await window.api.streaming.getStatus();
    setStatus(result || {});
  };

  // Save form values to localStorage
  const saveFormValues = () => {
    try {
      const values = form.getFieldsValue();
      const toSave = { ...values, targetTime: values.targetTime?.toISOString() || undefined };
      localStorage.setItem(STREAMING_FORM_KEY, JSON.stringify(toSave));
    } catch { /* ignore */ }
  };

  // Restore form values from localStorage
  const restoreFormValues = () => {
    try {
      const saved = localStorage.getItem(STREAMING_FORM_KEY);
      if (saved) {
        const values = JSON.parse(saved);
        if (values.targetTime) values.targetTime = dayjs(values.targetTime);
        form.setFieldsValue(values);
        return true;
      }
    } catch { /* ignore */ }
    return false;
  };

  useEffect(() => {
    const restored = restoreFormValues();
    if (!restored && user?.roomId) { form.setFieldValue('roomId', String(user.roomId)); }
    loadStatus();
    const timer = window.setInterval(loadStatus, 1500);
    return () => window.clearInterval(timer);
  }, [user?.roomId]);

  useEffect(() => {
    const loadDefaults = async () => {
      const resources = await window.api.tasks.resources();
      const ffmpeg = (resources.executables || []).find((item: any) => String(item.name).toLowerCase().startsWith('ffmpeg'));
      if (ffmpeg?.path && !form.getFieldValue('ffmpegPath')) { form.setFieldValue('ffmpegPath', ffmpeg.path); }
    };
    loadDefaults();
  }, []);

  const handleStart = async () => {
    setLoading(true);
    try {
      const values = await form.validateFields();
      saveFormValues();
      const result = await window.api.streaming.start({ ...values, targetTime: values.targetTime?.toISOString() });
      if (result.success) { dispatch(startStreamAction(values)); message.success('推流任务已启动'); await loadStatus(); }
      else { message.error(result.error || '启动失败'); }
    } catch { message.error('启动失败，请检查配置'); } finally { setLoading(false); }
  };

  const handleStop = async () => {
    const result = await window.api.streaming.stop();
    if (result.success) { dispatch(stopStreamAction()); message.success('推流已停止'); await loadStatus(); }
  };

  const handleSelectVideo = async () => {
    setVideoLoading(true);
    try {
      const result = await window.api.system.selectVideoFile();
      if (!result?.canceled && result.filePath) { form.setFieldValue('videoPath', result.filePath); saveFormValues(); }
    } finally { setVideoLoading(false); }
  };

  const setQuickStart = (seconds: number) => { form.setFieldValue('targetTime', dayjs().add(seconds, 'second')); };

  const isStreaming = status.isStreaming || streaming.isStreaming;

  const levelColor = (value: string) => value === 'error' ? 'var(--bt-error)' : value === 'warning' ? 'var(--bt-warning)' : value === 'success' ? 'var(--bt-success)' : 'var(--bt-info)';

  return (
    <div>
      {/* Page header */}
      <div className="bt-page-header bt-animate-fade-in">
        <div className="bt-page-header-bar" aria-hidden="true" />
        <div>
          <h1>直播推流</h1>
          <p>定时直播推流 / 仿 OBS 推流</p>
        </div>
        <div className="bt-page-actions">
          <span className={`bt-badge ${isStreaming ? 'bt-badge-running' : 'bt-badge-idle'}`} aria-live="polite">
            {isStreaming && <span className="bt-pulse" aria-hidden="true" />}
            {status.status || 'idle'}
          </span>
        </div>
      </div>

      <Row gutter={16}>
        <Col xs={24} lg={9}>
          <Card title="推流配置">
            <Form form={form} layout="vertical" initialValues={{ mode: 'obs', quality: 'low', cpuMode: true }}>
              <Form.Item name="mode" label="推流模式">
                <Select onChange={saveFormValues}>
                  <Select.Option value="obs">仿 OBS 推流</Select.Option>
                  <Select.Option value="bili-live">B站开播 + 自动推流</Select.Option>
                </Select>
              </Form.Item>
              <Form.Item name="roomId" label="直播间号" rules={[{ required: true, message: '请输入直播间号' }]}>
                <Input placeholder="B站直播间号" autoFocus onChange={saveFormValues} />
              </Form.Item>
              <Form.Item name="game" label="游戏分区">
                <Select allowClear placeholder="用于 B站开播模式" onChange={saveFormValues}>
                  <Select.Option value="genshin">原神</Select.Option>
                  <Select.Option value="starrail">崩坏：星穹铁道</Select.Option>
                  <Select.Option value="zzz">绝区零</Select.Option>
                  <Select.Option value="wutheringwaves">鸣潮</Select.Option>
                </Select>
              </Form.Item>
              <Form.Item name="rtmpUrl" label="RTMP服务器地址">
                <Input placeholder="仿 OBS 模式填写，例如 rtmp://host/live" onChange={saveFormValues} />
              </Form.Item>
              <Form.Item name="streamKey" label="推流密钥">
                <Input.Password placeholder="仿 OBS 模式填写" onChange={saveFormValues} />
              </Form.Item>
              <Form.Item name="videoPath" label="视频文件路径">
                <Input
                  placeholder="/path/to/video.mp4"
                  suffix={videoLoading ? <LoadingOutlined style={{ color: 'var(--bt-info)' }} /> : form.getFieldValue('videoPath') ? <CheckCircleOutlined style={{ color: 'var(--bt-success)' }} /> : null}
                  addonAfter={<Button type="text" size="small" icon={<FolderOpenOutlined />} onClick={handleSelectVideo} loading={videoLoading} style={{ margin: '-4px -8px' }}>浏览</Button>}
                  onChange={saveFormValues}
                />
              </Form.Item>
              <Form.Item name="ffmpegPath" label="ffmpeg路径">
                <Input placeholder="默认使用系统 ffmpeg" onChange={saveFormValues} />
              </Form.Item>
              <Form.Item name="targetTime" label="定时开始">
                <DatePicker showTime style={{ width: '100%' }} placeholder="不填则立即推流" onChange={saveFormValues} />
              </Form.Item>
              <Space style={{ marginTop: -12, marginBottom: 16 }} wrap>
                <Button size="small" onClick={() => { setQuickStart(10); saveFormValues(); }}>10秒后</Button>
                <Button size="small" onClick={() => { setQuickStart(60); saveFormValues(); }}>1分钟后</Button>
                <Button size="small" onClick={() => { setQuickStart(300); saveFormValues(); }}>5分钟后</Button>
                <Button size="small" onClick={() => { form.setFieldValue('targetTime', undefined); saveFormValues(); }}>立即</Button>
              </Space>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="quality" label="画质">
                    <Select onChange={saveFormValues}>
                      <Select.Option value="high">高质量</Select.Option>
                      <Select.Option value="medium">中质量</Select.Option>
                      <Select.Option value="low">低质量</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="duration" label="定时关播(秒)">
                    <InputNumber min={0} style={{ width: '100%' }} placeholder="暂不自动关播" onChange={saveFormValues} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="cpuMode" label="CPU推流" valuePropName="checked">
                <Switch onChange={saveFormValues} />
              </Form.Item>
              <Divider />
              {isStreaming ? (
                <Button block danger icon={<StopOutlined />} onClick={handleStop}>终止推流/关播</Button>
              ) : (
                <Button block type="primary" icon={<VideoCameraOutlined />} loading={loading} onClick={handleStart}>开始推流</Button>
              )}
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={15}>
          <Card
            title="推流状态"
            extra={<Space><Tag color={isStreaming ? 'red' : 'default'}>{status.status || 'idle'}</Tag><Button icon={<ReloadOutlined />} onClick={loadStatus}>刷新</Button></Space>}
          >
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <div className="bt-stream-status-row" role="listitem">
                <span className="bt-stream-status-label">房间号</span>
                <span className="bt-stream-status-value">{status.roomId || '-'}</span>
              </div>
              <div className="bt-stream-status-row" role="listitem">
                <span className="bt-stream-status-label">模式</span>
                <span className="bt-stream-status-value">{status.mode || '-'}</span>
              </div>
              <div className="bt-stream-status-row" role="listitem">
                <span className="bt-stream-status-label">时长</span>
                <span className="bt-stream-status-value">{status.duration || 0}s</span>
              </div>
              <div className="bt-stream-status-row" role="listitem">
                <span className="bt-stream-status-label">RTMP</span>
                <span className="bt-stream-status-value" style={{ fontSize: 12 }}>{status.rtmpUrl || '-'}</span>
              </div>
              <Divider style={{ margin: '4px 0' }} />
              {/* Log window */}
              <div className="bt-log-window" role="log" aria-label="推流日志" aria-live="polite">
                {(status.logs || []).length === 0 ? (
                  <div className="bt-empty-state" role="status">
                    <ReloadOutlined className="bt-empty-state-icon" aria-hidden="true" />
                    <p className="bt-empty-state-text">暂无日志</p>
                  </div>
                ) : (
                  (status.logs || []).map((log: any, idx: number) => (
                    <div key={`stream-log-${idx}`} className="bt-log-entry">
                      <span className="bt-log-time">{log.time}</span>
                      <Tag color={log.level === 'error' ? 'red' : log.level === 'warning' ? 'gold' : log.level === 'success' ? 'green' : 'blue'} className="bt-log-level">{log.level}</Tag>
                      <span
                        className="bt-log-message"
                        style={{ color: log.level === 'error' ? 'var(--bt-error)' : log.level === 'warning' ? 'var(--bt-warning)' : 'var(--bt-text-secondary)' }}
                      >
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default StreamingPage;
