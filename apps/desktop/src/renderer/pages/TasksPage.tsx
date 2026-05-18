import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Checkbox, Col, DatePicker, Form, Input, InputNumber, message, Popconfirm, Progress, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import { DeleteOutlined, PlayCircleOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setTasks, addTask, startTask, stopTask, removeTask } from '../store/slices/tasksSlice';

const TASKS_FORM_KEY = 'bilitools_tasks_form';

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
  dayStock?: number | string;
  totalStock?: number | string;
  taskStatus?: string | number;
  taskStatusLabel?: string;
  stockSummary?: string;
  stockFetchedAt?: string;
  queryCode?: number;
  queryMessage?: string;
  queryError?: string;
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
  const [stockLoading, setStockLoading] = useState(false);

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

  // Save form values
  const saveFormValues = () => {
    try {
      const values = form.getFieldsValue();
      const toSave = { ...values, targetTime: values.targetTime?.toISOString() || undefined };
      localStorage.setItem(TASKS_FORM_KEY, JSON.stringify(toSave));
    } catch { /* ignore */ }
  };

  // Restore form values
  const restoreFormValues = () => {
    try {
      const saved = localStorage.getItem(TASKS_FORM_KEY);
      if (saved) {
        const values = JSON.parse(saved);
        if (values.targetTime) values.targetTime = new Date(values.targetTime);
        form.setFieldsValue(values);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const bootstrap = async () => {
      await loadGames();
      await loadResources();
      restoreFormValues();
      const restoredGame = form.getFieldValue('game');
      if (restoredGame) {
        await handleGameChange(restoredGame);
      }
      await loadTasks();
    };
    bootstrap();
    const timer = window.setInterval(loadTasks, 2000);
    return () => window.clearInterval(timer);
  }, []);

  const handleGameChange = async (game: string) => {
    form.setFieldValue('game', game);
    setSelectedIds([]);
    saveFormValues();
    const result = await window.api.tasks.gameTasks(game);
    setResources(result.tasks || []);
    const gameInfo = games.find((item) => item.id === game);
    setSourceUrl(gameInfo?.sourceUrl || '');
    await loadOverview(game, gameInfo?.sourceUrl);
  };

  const handleRefreshConfig = async () => {
    const game = form.getFieldValue('game');
    if (!game) { message.error('请先选择游戏'); return; }
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

  const handleQueryStocks = async (selectedOnly = false) => {
    const game = form.getFieldValue('game');
    if (!game) { message.error('请先选择游戏'); return; }
    let currentResources = resources;
    if (!currentResources.length) {
      const loaded = await window.api.tasks.gameTasks(game);
      currentResources = loaded.tasks || [];
      setResources(currentResources);
    }
    const taskIds = selectedOnly ? selectedIds : currentResources.map((item) => item.id);
    if (selectedOnly && taskIds.length === 0) { message.error('请先选择资源道具'); return; }
    setStockLoading(true);
    try {
      const result = await window.api.tasks.stocks(game, taskIds.length ? taskIds : undefined);
      if (result?.success) {
        const stockMap = new Map<string, ResourceTask>((result.tasks || []).map((item: ResourceTask) => [item.id, item]));
        setResources((items) => {
          if (!items.length) return result.tasks || [];
          return items.map((item) => ({ ...item, ...(stockMap.get(item.id) || {}) }));
        });
        const failed = (result.tasks || []).filter((item: ResourceTask) => item.queryError || item.queryMessage).length;
        message.success(failed ? `库存已更新，${failed} 个资源查询异常` : `库存已更新，共 ${result.tasks?.length || 0} 个资源`);
      } else {
        message.error(result?.error || '库存查询失败');
      }
    } catch {
      message.error('库存查询失败');
    } finally {
      setStockLoading(false);
    }
  };

  const handleCreateAndStart = async () => {
    setLoading(true);
    try {
      const values = await form.validateFields();
      const selectedTasks = resources.filter((item) => selectedIds.includes(item.id));
      if (selectedTasks.length === 0) { message.error('请选择至少一个资源道具'); return; }
      saveFormValues();
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

  const formatStock = (value: ResourceTask['dayStock']) => {
    if (value === undefined || value === null || value === '') return '-';
    return `${value}%`;
  };

  return (
    <div>
      {/* Page header */}
      <div className="bt-page-header bt-animate-fade-in">
        <div className="bt-page-header-bar" />
        <div>
          <h1>任务管理</h1>
          <p>精准定时 · 多线程并发 · 自动重试</p>
        </div>
      </div>

      <Row gutter={16}>
        <Col span={9}>
          <Card title="选择资源道具 + 定时抢码">
            <Form form={form} layout="vertical" initialValues={{ interval: 0.3, holdtime: 30 }}>
              <Form.Item name="name" label="任务名称">
                <Select placeholder="选择模板名称或留空" allowClear onChange={saveFormValues}>
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
                  <Input value={sourceUrl} onChange={(event) => { setSourceUrl(event.target.value); saveFormValues(); }} placeholder="B站 blackboard/era 活动页面 URL" />
                  <Button onClick={handleRefreshConfig}>刷新配置</Button>
                </Space.Compact>
              </Form.Item>
              {overview ? (
                <Row gutter={8} style={{ marginBottom: 16 }}>
                  <Col span={8}><div className="bt-stat-card" style={{ padding: 12 }}><Statistic title="直播完成天数" value={overview.liveDays ?? '-'} /></div></Col>
                  <Col span={8}><div className="bt-stat-card" style={{ padding: 12 }}><Statistic title="看播完成天数" value={overview.watchDays ?? '-'} /></div></Col>
                  <Col span={8}><div className="bt-stat-card" style={{ padding: 12 }}><Statistic title="投稿稿件总数" value={overview.submitCount ?? '-'} /></div></Col>
                </Row>
              ) : null}
              <Form.Item
                label="资源道具"
                extra={resources.some((item) => item.stockFetchedAt) ? `最近库存更新时间：${resources.find((item) => item.stockFetchedAt)?.stockFetchedAt}` : undefined}
              >
                <Space style={{ marginBottom: 8 }} wrap>
                  <Button size="small" icon={<ReloadOutlined />} loading={stockLoading} onClick={() => handleQueryStocks(false)}>查询库存</Button>
                  <Button size="small" loading={stockLoading} disabled={!selectedIds.length} onClick={() => handleQueryStocks(true)}>查询选中库存</Button>
                </Space>
                <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid var(--bt-glass-border)', borderRadius: 12, padding: 12, background: 'color-mix(in srgb, var(--bt-bg-overlay) 55%, transparent)' }}>
                  <Checkbox.Group value={selectedIds} onChange={(ids) => { setSelectedIds(ids as string[]); saveFormValues(); }}>
                    <Space direction="vertical">
                      {resources.map((item) => (
                        <Checkbox key={item.id} value={item.id}>
                          <Space size={6} wrap>
                            <span style={{ color: 'var(--bt-text-primary)' }}>{item.name}</span>
                            {item.awardName ? <Tag color="green">{item.awardName}</Tag> : null}
                            {item.dayStock !== undefined || item.totalStock !== undefined ? (
                              <>
                                <Tag color="blue">每日 {formatStock(item.dayStock)}</Tag>
                                <Tag color="purple">总量 {formatStock(item.totalStock)}</Tag>
                              </>
                            ) : null}
                            {item.taskStatus !== undefined ? <Tag color="gold">状态 {item.taskStatusLabel || item.taskStatus}</Tag> : null}
                            {item.stockSummary ? <Tag color="cyan">{item.stockSummary}</Tag> : null}
                            {item.queryError || item.queryMessage ? <Tag color="red">{item.queryMessage || item.queryError}</Tag> : null}
                            <Tag>{item.id}</Tag>
                          </Space>
                        </Checkbox>
                      ))}
                    </Space>
                  </Checkbox.Group>
                </div>
              </Form.Item>
              <Form.Item name="targetTime" label="目标时间">
                <DatePicker showTime style={{ width: '100%' }} placeholder="不填则立即执行" onChange={saveFormValues} />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="interval" label="抢码间隔(秒)">
                    <InputNumber min={0.05} step={0.05} style={{ width: '100%' }} onChange={saveFormValues} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="holdtime" label="自动停止(秒)">
                    <InputNumber min={1} style={{ width: '100%' }} onChange={saveFormValues} />
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
          <Card title={activeTask ? `执行日志 - ${activeTask.config?.name || activeTask.id}` : '执行日志'} style={{ marginTop: 16 }}>
            {/* Log window */}
            <div
              style={{
                height: 300,
                overflowY: 'auto',
                background: 'color-mix(in srgb, var(--bt-bg-overlay) 55%, transparent)',
                border: '1px solid var(--bt-glass-border)',
                borderRadius: 12,
                padding: '8px 12px',
                fontFamily: 'monospace',
                fontSize: 12,
              }}
            >
              {(!((activeTask as any)?.logs?.length)) && (
                <div style={{ color: 'var(--bt-text-disabled)', textAlign: 'center', padding: 24 }}>暂无日志</div>
              )}
              {((activeTask as any)?.logs || []).map((log: any, idx: number) => (
                <div key={`task-log-${activeTask?.id}-${idx}`} style={{ display: 'flex', gap: 8, padding: '3px 0', borderBottom: '1px solid color-mix(in srgb, var(--bt-glass-border) 50%, transparent)' }}>
                  <span style={{ color: 'var(--bt-text-disabled)', flexShrink: 0, width: 64 }}>{log.time}</span>
                  <Tag color={log.level === 'error' ? 'red' : log.level === 'warning' ? 'gold' : log.level === 'success' ? 'green' : 'blue'} style={{ margin: 0, flexShrink: 0, minWidth: 56, textAlign: 'center' }}>{log.level}</Tag>
                  <span style={{ color: log.level === 'error' ? '#ff4d4f' : log.level === 'warning' ? '#faad14' : 'var(--bt-text-secondary)', whiteSpace: 'pre-wrap' }}>{log.message}</span>
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default TasksPage;
