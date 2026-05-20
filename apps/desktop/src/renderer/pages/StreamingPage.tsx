import React, { useEffect, useRef, useState } from 'react';
import { Button, Card, Col, DatePicker, Divider, Form, Input, InputNumber, List, message, Modal, Row, Select, Space, Switch, Tag, Typography } from 'antd';
import { CheckCircleOutlined, DeleteOutlined, EditOutlined, FolderOpenOutlined, LoadingOutlined, PlayCircleOutlined, ReloadOutlined, SaveOutlined, StopOutlined, VideoCameraOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { startStreamAction, stopStreamAction } from '../store/slices/streamingSlice';

const STREAMING_FORM_KEY = 'bilitools_streaming_form';
const STREAMING_TIME_FORMAT = 'YYYY-MM-DDTHH:mm:ss';
const workflowFormItemStyle = { marginBottom: 12 };

const serializeTargetTime = (value: dayjs.Dayjs | undefined) => value?.format(STREAMING_TIME_FORMAT);

const extractStreamingState = (result: any) => result?.state || result?.data?.state || result?.data || result;

const assertStreamingSuccess = (result: any, fallback: string) => {
  if (result?.success === false || result?.ok === false) {
    throw new Error(result?.error || result?.message || fallback);
  }
  return extractStreamingState(result);
};

const StreamingPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const streaming = useAppSelector((state) => state.streaming);
  const user = useAppSelector((state) => state.auth.user);
  const [form] = Form.useForm();
  const [workflowForm] = Form.useForm();
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
      const toSave = { ...values, targetTime: serializeTargetTime(values.targetTime) || undefined };
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
    workflowForm.setFieldsValue({ name: '定时推流工作流', repeat: 'once', enabled: true, targetTime: dayjs().add(1, 'hour') });
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
      const result = await window.api.streaming.start({ ...values, targetTime: serializeTargetTime(values.targetTime) });
      const nextState = assertStreamingSuccess(result, '启动失败');
      dispatch(startStreamAction(values));
      if (nextState) setStatus(nextState);
      message.success(nextState?.status === 'waiting' ? '定时推流任务已设置' : '推流任务已启动');
      await loadStatus();
    } catch (error: any) {
      message.error(error?.message || '启动失败，请检查配置');
    } finally { setLoading(false); }
  };

  const handleStop = async () => {
    try {
      const result = await window.api.streaming.stop();
      const nextState = assertStreamingSuccess(result, '停止失败');
      dispatch(stopStreamAction());
      if (nextState) setStatus(nextState);
      message.success('推流已停止');
      await loadStatus();
    } catch (error: any) {
      message.error(error?.message || '停止失败');
    }
  };

  const handleSelectVideo = async () => {
    setVideoLoading(true);
    try {
      const result = await window.api.system.selectVideoFile();
      if (!result?.canceled && result.filePath) { form.setFieldValue('videoPath', result.filePath); saveFormValues(); }
    } finally { setVideoLoading(false); }
  };

  const setQuickStart = (seconds: number) => { form.setFieldValue('targetTime', dayjs().add(seconds, 'second')); };

  const saveWorkflow = async () => {
    setLoading(true);
    try {
      const streamValues = await form.validateFields();
      const workflowValues = await workflowForm.validateFields();
      const result = await window.api.streaming.saveWorkflow({
        ...workflowValues,
        targetTime: serializeTargetTime(workflowValues.targetTime),
        streamConfig: { ...streamValues, targetTime: '' },
      });
      if (result?.workflow?.id) workflowForm.setFieldValue('id', result.workflow.id);
      message.success('推流工作流已保存');
      await loadStatus();
    } catch (error: any) {
      message.error(error?.message || '推流工作流保存失败');
    } finally { setLoading(false); }
  };

  const newWorkflow = () => {
    workflowForm.setFieldsValue({
      id: undefined,
      name: '定时推流工作流',
      repeat: 'once',
      enabled: true,
      targetTime: dayjs().add(1, 'hour'),
    });
    message.info('已切换为新建推流工作流');
  };

  const editWorkflow = (workflow: any) => {
    workflowForm.setFieldsValue({ ...workflow, targetTime: workflow.targetTime ? dayjs(workflow.targetTime) : undefined });
    if (workflow.streamConfig) form.setFieldsValue(workflow.streamConfig);
    message.info('已载入推流工作流');
  };

  const runWorkflowNow = async (workflowId: string) => {
    setLoading(true);
    try {
      await window.api.streaming.runWorkflow(workflowId);
      message.success('推流工作流已执行');
      await loadStatus();
    } catch (error: any) {
      message.error(error?.message || '推流工作流执行失败');
    } finally { setLoading(false); }
  };

  const deleteWorkflow = (workflowId: string) => {
    Modal.confirm({
      title: '删除这个推流工作流？',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await window.api.streaming.deleteWorkflow(workflowId);
        if (workflowForm.getFieldValue('id') === workflowId) workflowForm.resetFields();
        message.success('推流工作流已删除');
        await loadStatus();
      },
    });
  };

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

      <Row gutter={16} className="bt-equal-row">
        <Col xs={24} lg={9}>
          <Card title="推流配置" className="bt-fill-card">
            <Form form={form} layout="vertical" initialValues={{ mode: 'obs', quality: 'low', cpuMode: true }} className="bt-card-form">
              <div className="bt-card-form-scroll">
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
              </div>
              <div className="bt-card-form-footer">
              {isStreaming ? (
                <Button block danger icon={<StopOutlined />} onClick={handleStop}>终止推流/关播</Button>
              ) : (
                <Button block type="primary" icon={<VideoCameraOutlined />} loading={loading} onClick={handleStart}>开始推流</Button>
              )}
              </div>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={15}>
          <Card
            className="bt-fill-card"
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
              <div className="bt-log-window bt-log-window-fill" role="log" aria-label="推流日志" aria-live="polite">
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
      <Card title="推流自动化工作流" className="bt-workflow-card" style={{ marginTop: 16 }}>
        <Form form={workflowForm} layout="vertical">
          <Form.Item name="id" hidden><Input /></Form.Item>
          <Row gutter={[16, 8]} align="bottom">
            <Col xs={24} sm={12} xl={6}>
              <Form.Item name="name" label="工作流名称" style={workflowFormItemStyle} rules={[{ required: true, message: '请输入工作流名称' }]}>
                <Input placeholder="例如：每天定时开播" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} xl={3}>
              <Form.Item name="repeat" label="触发方式" style={workflowFormItemStyle}>
                <Select options={[{ value: 'once', label: '仅一次' }, { value: 'daily', label: '每天' }]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} xl={5}>
              <Form.Item name="targetTime" label="触发时间" style={workflowFormItemStyle} rules={[{ required: true, message: '请选择触发时间' }]}>
                <DatePicker
                  showTime
                  style={{ width: '100%' }}
                  renderExtraFooter={() => <Button type="link" size="small" onClick={() => workflowForm.setFieldValue('targetTime', dayjs().add(1, 'minute'))}>1分钟后</Button>}
                />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} xl={3}>
              <Form.Item name="enabled" label="状态" style={workflowFormItemStyle}>
                <Select options={[{ value: true, label: '启用' }, { value: false, label: '停用' }]} />
              </Form.Item>
            </Col>
            <Col xs={24} xl={7}>
              <Form.Item label="操作" style={workflowFormItemStyle}>
                <Space wrap>
                  <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={saveWorkflow}>保存工作流</Button>
                  <Button onClick={newWorkflow}>新建工作流</Button>
                </Space>
              </Form.Item>
            </Col>
          </Row>
        </Form>
        <List
          dataSource={status.workflows || []}
          locale={{ emptyText: '暂无推流工作流' }}
          renderItem={(workflow: any) => (
            <List.Item
              actions={[
                <Button key="run" size="small" icon={<PlayCircleOutlined />} loading={loading} onClick={() => runWorkflowNow(workflow.id)}>立即执行</Button>,
                <Button key="edit" size="small" icon={<EditOutlined />} onClick={() => editWorkflow(workflow)}>编辑</Button>,
                <Button key="delete" size="small" danger icon={<DeleteOutlined />} onClick={() => deleteWorkflow(workflow.id)}>删除</Button>,
              ]}
            >
              <List.Item.Meta
                title={<Space wrap><Typography.Text>{workflow.name}</Typography.Text><Tag color={workflow.enabled ? 'green' : 'default'}>{workflow.enabled ? '启用' : '停用'}</Tag><Tag>{workflow.repeat === 'daily' ? '每天' : '仅一次'}</Tag><Tag color={workflow.lastStatus === 'error' ? 'red' : workflow.lastStatus === 'success' ? 'green' : 'default'}>{workflow.lastStatus || 'idle'}</Tag></Space>}
                description={<Typography.Text style={{ color: 'var(--bt-text-secondary)', fontSize: 12 }}>房间 {workflow.streamConfig?.roomId || '-'} · 下次触发 {workflow.nextRunAt || '-'}</Typography.Text>}
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
};

export default StreamingPage;
