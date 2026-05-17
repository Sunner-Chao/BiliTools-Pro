import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Checkbox, Col, DatePicker, Form, Input, InputNumber, message, Popconfirm, Progress, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import { DeleteOutlined, PlayCircleOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setTasks, addTask, startTask, stopTask, removeTask } from '../store/slices/tasksSlice';

interface GameOption {
  id: string;
  name: string;
  taskCount: number;
  sourceUrl?: string;
}

interface ResourceTask {
  id: string;
  name: string;
  description?: string;
  awardName?: string;
  activityId?: string;
  taskName?: string;
  url?: string;
}

const TasksPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector((state) => state.tasks.tasks);
  const [form] = Form.useForm();
  const [games, setGames] = useState<GameOption[]>([]);
  const [resources, setResources] = useState<ResourceTask[]>([]);
  const [sourceUrl, setSourceUrl] = useState('');
  const [resourceInfo, setResourceInfo] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) || tasks[0], [tasks, activeTaskId]);

  const loadTasks = async () => {
    const result = await window.api.tasks.list();
    dispatch(setTasks(result.tasks || []));
  };

  const loadGames = async () => {
    const result = await window.api.tasks.games();
    setGames(result.games || []);
  };

  const loadResources = async () => {
    const result = await window.api.tasks.resources();
    setResourceInfo(result);
  };

  const loadOverview = async (game?: string, url?: string) => {
    if (!game) return;
    const result = await window.api.tasks.overview(game, url || undefined);
    if (result?.success) {
      setOverview(result);
    }
  };

  useEffect(() => {
    loadGames();
    loadResources();
    loadTasks();
    const timer = window.setInterval(loadTasks, 2000);
    return () => window.clearInterval(timer);
  }, []);

  const handleGameChange = async (game: string) => {
    form.setFieldValue('game', game);
    setSelectedIds([]);
    const result = await window.api.tasks.gameTasks(game);
    setResources(result.tasks || []);
    const gameInfo = games.find((item) => item.id === game);
    setSourceUrl(gameInfo?.sourceUrl || '');
    await loadOverview(game, gameInfo?.sourceUrl);
  };

  const handleRefreshConfig = async () => {
    const game = form.getFieldValue('game');
    if (!game) {
      message.error('请先选择游戏');
      return;
    }
    const result = await window.api.tasks.refreshGameConfig(game, sourceUrl || undefined);
    if (result.success) {
      message.success(`配置已刷新，任务数 ${result.taskCount}`);
      await loadGames();
      await handleGameChange(game);
      await loadOverview(game, result.sourceUrl || sourceUrl);
    } else {
      message.error(result.error || '刷新失败');
    }
  };

  const handleCreateAndStart = async () => {
    setLoading(true);
    try {
      const values = await form.validateFields();
      const selectedTasks = resources.filter((item) => selectedIds.includes(item.id));
      if (selectedTasks.length === 0) {
        message.error('请选择至少一个资源道具');
        return;
      }
      const result = await window.api.tasks.create({
        type: 'grab_code',
        game: values.game,
        name: values.name || '定时抢码任务',
        targetTime: values.targetTime?.toISOString(),
        interval: values.interval,
        holdtime: values.holdtime,
        selectedTasks,
      });
      if (result.success) {
        dispatch(addTask(result.task));
        setActiveTaskId(result.task.id);
        const started = await window.api.tasks.start(result.task.id);
        if (started.success) {
          dispatch(startTask(result.task.id));
          message.success('定时抢码任务已启动');
        } else {
          message.error(started.error || '启动失败');
        }
      }
    } catch {
      message.error('创建失败，请检查参数');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async (taskId: string) => {
    const result = await window.api.tasks.stop(taskId);
    if (result.success) {
      dispatch(stopTask(taskId));
      message.success('任务已停止');
      await loadTasks();
    }
  };

  const handleDelete = async (taskId: string) => {
    const result = await window.api.tasks.delete(taskId);
    if (result.success) {
      dispatch(removeTask(taskId));
      if (activeTaskId === taskId) setActiveTaskId(null);
      message.success('任务已删除');
      await loadTasks();
    } else {
      message.error(result.error || '删除失败');
    }
  };

  const columns = [
    { title: '名称', dataIndex: ['config', 'name'], key: 'name', render: (v: string, r: any) => v || r.id },
    { title: '游戏', dataIndex: ['config', 'game'], key: 'game' },
    { title: '资源数', dataIndex: ['config', 'selectedTasks'], key: 'count', render: (v: ResourceTask[] = []) => v.length },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s: string, record: any) => (
        <Space size={4}>
          <Tag color={s === 'running' ? 'processing' : s === 'waiting' ? 'gold' : s === 'completed' ? 'success' : s === 'failed' ? 'error' : 'default'}>{s}</Tag>
          {s === 'waiting' ? <Tag>{formatDuration(record.countdownSeconds || 0)}</Tag> : null}
        </Space>
      ),
    },
    { title: '进度', dataIndex: 'progress', key: 'progress', render: (p: number) => <Progress percent={p || 0} size="small" /> },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: any) => (
        <Space>
          <Button size="small" type="link" onClick={() => setActiveTaskId(record.id)}>日志</Button>
          {(record.status === 'running' || record.status === 'waiting') && <Button size="small" danger icon={<StopOutlined />} onClick={() => handleStop(record.id)}>停止</Button>}
          <Popconfirm title="删除任务记录？" okText="删除" cancelText="取消" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '00:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      : `${minutes}:${String(secs).padStart(2, '0')}`;
  };

  const logColumns = [
    { title: '时间', dataIndex: 'time', key: 'time', width: 86, render: (value: string) => <Typography.Text type="secondary">{value}</Typography.Text> },
    { title: '级别', dataIndex: 'level', key: 'level', width: 92, render: (value: string) => <Tag color={value === 'error' ? 'red' : value === 'warning' ? 'gold' : value === 'success' ? 'green' : 'blue'}>{value}</Tag> },
    { title: '输出', dataIndex: 'message', key: 'message', render: (value: string) => <Typography.Text style={{ whiteSpace: 'pre-wrap' }}>{value}</Typography.Text> },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={16}>
        <Col span={9}>
          <Card title="选择资源道具 + 定时抢码">
            <Form form={form} layout="vertical" initialValues={{ interval: 0.3, holdtime: 30 }}>
              <Form.Item name="name" label="任务名称">
                <Select placeholder="选择模板名称或留空" allowClear>
                  <Select.Option value="定时抢码任务">定时抢码任务</Select.Option>
                  <Select.Option value="到点跳过验证码任务">到点跳过验证码任务</Select.Option>
                </Select>
              </Form.Item>
              <Form.Item name="game" label="游戏配置" rules={[{ required: true, message: '请选择游戏' }]}>
                <Select placeholder="选择游戏" onChange={handleGameChange}>
                  {games.map((game) => <Select.Option key={game.id} value={game.id}>{game.name} ({game.taskCount})</Select.Option>)}
                </Select>
              </Form.Item>
              <Form.Item label="活动配置来源">
                <Space.Compact style={{ width: '100%' }}>
                  <Input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="B站 blackboard/era 活动页面 URL" />
                  <Button onClick={handleRefreshConfig}>刷新配置</Button>
                </Space.Compact>
              </Form.Item>
              {overview ? (
                <Row gutter={8} style={{ marginBottom: 16 }}>
                  <Col span={8}>
                    <Card size="small">
                      <Statistic title="直播完成天数" value={overview.liveDays ?? '-'} />
                    </Card>
                  </Col>
                  <Col span={8}>
                    <Card size="small">
                      <Statistic title="投稿稿件总数" value={overview.submitCount ?? '-'} />
                    </Card>
                  </Col>
                  <Col span={8}>
                    <Card size="small">
                      <Statistic title="活动倒计时" value={overview.countdownSeconds ? formatDuration(overview.countdownSeconds) : '-'} />
                    </Card>
                  </Col>
                </Row>
              ) : null}
              <Form.Item label="资源道具">
                <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid #f0f0f0', padding: 8 }}>
                  <Checkbox.Group value={selectedIds} onChange={(ids) => setSelectedIds(ids as string[])}>
                    <Space direction="vertical">
                      {resources.map((item) => (
                        <Checkbox key={item.id} value={item.id}>
                          <Space size={6} wrap>
                            <span>{item.name}</span>
                            {item.awardName ? <Tag color="green">{item.awardName}</Tag> : null}
                            <Tag>{item.id}</Tag>
                          </Space>
                        </Checkbox>
                      ))}
                    </Space>
                  </Checkbox.Group>
                </div>
              </Form.Item>
              <Form.Item name="targetTime" label="目标时间">
                <DatePicker showTime style={{ width: '100%' }} placeholder="不填则立即执行" />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="interval" label="抢码间隔(秒)">
                    <InputNumber min={0.05} step={0.05} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="holdtime" label="自动停止(秒)">
                    <InputNumber min={1} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              <Button block type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={handleCreateAndStart}>启动抢码任务</Button>
            </Form>
          </Card>
        </Col>
        <Col span={15}>
          <Card title="任务列表" extra={<Button icon={<ReloadOutlined />} onClick={loadTasks}>刷新</Button>}>
            <Table rowKey="id" size="small" dataSource={tasks} columns={columns} pagination={{ pageSize: 5 }} />
          </Card>
          <Card title="运行资源" style={{ marginTop: 16 }}>
            <Space direction="vertical" size={4}>
              <span>config: {resourceInfo?.paths?.config || '-'}</span>
              <span>cookies: {resourceInfo?.paths?.cookies || '-'}</span>
              <span>execute: {resourceInfo?.paths?.execute || '-'}</span>
              <span>可执行文件: {(resourceInfo?.executables || []).map((item: any) => item.name).join(', ') || '-'}</span>
            </Space>
          </Card>
          <Card title={activeTask ? `执行日志 - ${activeTask.config?.name || activeTask.id}` : '执行日志'} style={{ marginTop: 16 }}>
            <Table
              rowKey={(_, index) => `${activeTask?.id || 'log'}-${index}`}
              size="small"
              columns={logColumns}
              dataSource={(activeTask as any)?.logs || []}
              pagination={{ pageSize: 8, size: 'small' }}
              locale={{ emptyText: '暂无日志' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default TasksPage;
