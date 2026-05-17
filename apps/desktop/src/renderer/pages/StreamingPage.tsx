import React, { useEffect, useState } from 'react';
import { Button, Card, Col, DatePicker, Divider, Form, Input, InputNumber, message, Row, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { FolderOpenOutlined, ReloadOutlined, StopOutlined, VideoCameraOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { startStreaming as startStreamAction, stopStreaming as stopStreamAction } from '../store/slices/streamingSlice';

const StreamingPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const streaming = useAppSelector((state) => state.streaming);
  const user = useAppSelector((state) => state.auth.user);
  const [form] = Form.useForm();
  const [status, setStatus] = useState<any>({ logs: [] });
  const [loading, setLoading] = useState(false);

  const loadStatus = async () => {
    const result = await window.api.streaming.getStatus();
    setStatus(result || {});
  };

  useEffect(() => {
    if (user?.roomId) { form.setFieldValue('roomId', String(user.roomId)); }
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
    const result = await window.api.system.selectVideoFile();
    if (!result?.canceled && result.filePath) { form.setFieldValue('videoPath', result.filePath); }
  };

  const setQuickStart = (seconds: number) => { form.setFieldValue('targetTime', dayjs().add(seconds, 'second')); };

  const isStreaming = status.isStreaming || streaming.isStreaming;

  const logColumns = [
    { title: '时间', dataIndex: 'time', key: 'time', width: 86, render: (value: string) => <Typography.Text style={{ color: 'var(--bt-text-disabled)', fontSize: 12 }}>{value}</Typography.Text> },
    { title: '级别', dataIndex: 'level', key: 'level', width: 92, render: (value: string) => <Tag color={value === 'error' ? 'red' : value === 'warning' ? 'gold' : value === 'success' ? 'green' : 'blue'}>{value}</Tag> },
    { title: '输出', dataIndex: 'message', key: 'message', render: (value: string) => <Typography.Text style={{ whiteSpace: 'pre-wrap', color: 'var(--bt-text-secondary)' }}>{value}</Typography.Text> },
  ];

  return (
    <div>
      {/* Page header */}
      <div className="bt-page-header bt-animate-fade-in">
        <div className="bt-page-header-bar" />
        <div>
          <h1>直播推流</h1>
          <p>定时直播推流 / 仿 OBS 推流</p>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span className={`bt-badge ${isStreaming ? 'bt-badge-error' : 'bt-badge-idle'}`}>
            {isStreaming && <span className="bt-pulse" />}
            {status.status || 'idle'}
          </span>
        </div>
      </div>

      <Row gutter={16}>
        <Col span={9}>
          <Card title="推流配置">
            <Form form={form} layout="vertical" initialValues={{ mode: 'obs', quality: 'low', cpuMode: true }}>
              <Form.Item name="mode" label="推流模式">
                <Select>
                  <Select.Option value="obs">仿 OBS 推流</Select.Option>
                  <Select.Option value="bili-live">B站开播 + 自动推流</Select.Option>
                </Select>
              </Form.Item>
              <Form.Item name="roomId" label="直播间号" rules={[{ required: true, message: '请输入直播间号' }]}>
                <Input placeholder="B站直播间号" />
              </Form.Item>
              <Form.Item name="game" label="游戏分区">
                <Select allowClear placeholder="用于 B站开播模式">
                  <Select.Option value="genshin">原神</Select.Option>
                  <Select.Option value="starrail">崩坏：星穹铁道</Select.Option>
                  <Select.Option value="zzz">绝区零</Select.Option>
                  <Select.Option value="wutheringwaves">鸣潮</Select.Option>
                </Select>
              </Form.Item>
              <Form.Item name="rtmpUrl" label="RTMP服务器地址">
                <Input placeholder="仿 OBS 模式填写，例如 rtmp://host/live" />
              </Form.Item>
              <Form.Item name="streamKey" label="推流密钥">
                <Input.Password placeholder="仿 OBS 模式填写" />
              </Form.Item>
              <Form.Item name="videoPath" label="视频文件路径">
                <Space.Compact style={{ width: '100%' }}>
                  <Input placeholder="/path/to/video.mp4" />
                  <Button icon={<FolderOpenOutlined />} onClick={handleSelectVideo}>浏览</Button>
                </Space.Compact>
              </Form.Item>
              <Form.Item name="ffmpegPath" label="ffmpeg路径">
                <Input placeholder="默认使用系统 ffmpeg" />
              </Form.Item>
              <Form.Item name="targetTime" label="定时开始">
                <DatePicker showTime style={{ width: '100%' }} placeholder="不填则立即推流" />
              </Form.Item>
              <Space style={{ marginTop: -12, marginBottom: 16 }} wrap>
                <Button size="small" onClick={() => setQuickStart(10)}>10秒后</Button>
                <Button size="small" onClick={() => setQuickStart(60)}>1分钟后</Button>
                <Button size="small" onClick={() => setQuickStart(300)}>5分钟后</Button>
                <Button size="small" onClick={() => form.setFieldValue('targetTime', undefined)}>立即</Button>
              </Space>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="quality" label="画质">
                    <Select>
                      <Select.Option value="high">高质量</Select.Option>
                      <Select.Option value="medium">中质量</Select.Option>
                      <Select.Option value="low">低质量</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="duration" label="定时关播(秒)">
                    <InputNumber min={0} style={{ width: '100%' }} placeholder="暂不自动关播" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="cpuMode" label="CPU推流" valuePropName="checked">
                <Switch />
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
        <Col span={15}>
          <Card
            title="推流状态"
            extra={<Space><Tag color={isStreaming ? 'red' : 'default'}>{status.status || 'idle'}</Tag><Button icon={<ReloadOutlined />} onClick={loadStatus}>刷新</Button></Space>}
          >
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bt-glass-border)' }}>
                <span style={{ color: 'var(--bt-text-secondary)', fontSize: 13 }}>房间号</span>
                <span style={{ color: 'var(--bt-text-primary)', fontWeight: 500 }}>{status.roomId || '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bt-glass-border)' }}>
                <span style={{ color: 'var(--bt-text-secondary)', fontSize: 13 }}>模式</span>
                <span style={{ color: 'var(--bt-text-primary)', fontWeight: 500 }}>{status.mode || '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bt-glass-border)' }}>
                <span style={{ color: 'var(--bt-text-secondary)', fontSize: 13 }}>时长</span>
                <span style={{ color: 'var(--bt-text-primary)', fontWeight: 500 }}>{status.duration || 0}s</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span style={{ color: 'var(--bt-text-secondary)', fontSize: 13 }}>RTMP</span>
                <span style={{ color: 'var(--bt-text-primary)', fontWeight: 500, fontSize: 12 }}>{status.rtmpUrl || '-'}</span>
              </div>
              <Divider style={{ margin: '4px 0' }} />
              <Table
                rowKey={(_, index) => `stream-log-${index}`}
                size="small"
                columns={logColumns}
                dataSource={status.logs || []}
                pagination={{ pageSize: 8, size: 'small' }}
                locale={{ emptyText: '暂无日志' }}
              />
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default StreamingPage;
