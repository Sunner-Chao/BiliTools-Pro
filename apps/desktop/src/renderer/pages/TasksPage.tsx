import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Checkbox, Col, DatePicker, Form, Input, InputNumber, List, message, Modal, Popconfirm, Progress, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlayCircleOutlined, ReloadOutlined, SaveOutlined, StopOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setTasks, addTask, upsertTask, stopTask, removeTask } from '../store/slices/tasksSlice';

const TASKS_FORM_KEY = 'bilitools_tasks_form';
const TASK_TIME_FORMAT = 'YYYY-MM-DDTHH:mm:ss';
const workflowFormItemStyle = { marginBottom: 12 };

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
  const [workflowForm] = Form.useForm();
  const [games, setGames] = useState<GameOption[]>([]);
  const [resources, setResources] = useState<ResourceTask[]>([]);
  const [sourceUrl, setSourceUrl] = useState('');
  const [resourceInfo, setResourceInfo] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stockLoading, setStockLoading] = useState(false);
  const [resourceSearch, setResourceSearch] = useState('');
  const [taskWorkflows, setTaskWorkflows] = useState<any[]>([]);

  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) || tasks[0], [tasks, activeTaskId]);

  const filteredResources = useMemo(() => {
    if (!resourceSearch.trim()) return resources;
    const q = resourceSearch.toLowerCase();
    return resources.filter(
      (item) =>
        String(item.name || '').toLowerCase().includes(q) ||
        String(item.id || '').toLowerCase().includes(q) ||
        String(item.awardName || '').toLowerCase().includes(q),
    );
  }, [resources, resourceSearch]);

  const gameName = (gameId?: string) => games.find((game) => game.id === gameId)?.name || gameId || '-';

  const loadTasks = async () => {
    const result = await window.api.tasks.list();
    dispatch(setTasks(result.tasks || []));
    setTaskWorkflows(result.workflows || []);
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
    try {
      const result = await window.api.tasks.overview(game, url || undefined);
      setOverview(result);
    } catch { /* ignore */ }
  };

  // Save form values
  const saveFormValues = () => {
    try {
      const values = form.getFieldsValue();
      const toSave = { ...values, targetTime: values.targetTime?.format(TASK_TIME_FORMAT) || undefined };
      localStorage.setItem(TASKS_FORM_KEY, JSON.stringify(toSave));
    } catch { /* ignore */ }
  };

  // Restore form values
  const restoreFormValues = () => {
    try {
      const saved = localStorage.getItem(TASKS_FORM_KEY);
      if (saved) {
        const values = JSON.parse(saved);
        if (values.targetTime) values.targetTime = dayjs(values.targetTime);
        form.setFieldsValue(values);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const bootstrap = async () => {
      await loadGames();
      await loadResources();
      restoreFormValues();
      workflowForm.setFieldsValue({ name: '抢码自动化工作流', repeat: 'once', enabled: true, targetTime: dayjs().add(1, 'hour') });
      const restoredGame = form.getFieldValue('game');
      if (restoredGame) {
        await handleGameChange(restoredGame);
      }
      await loadTasks();
    };
    bootstrap().catch((error) => {
      message.error(error?.message || '任务管理加载失败');
    });
    // Subscribe to real-time task progress events (replaces setInterval polling)
    const unsub = window.api.on('tasks:progress', (data: any) => {
      if (data?.task?.id) {
        dispatch(upsertTask(data.task));
      }
    });
    return () => { unsub(); };
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
    try {
      const result = await window.api.tasks.refreshGameConfig(game, sourceUrl || undefined);
      message.success(`配置已刷新，任务数 ${result.taskCount}`);
      await loadGames();
      await handleGameChange(game);
      await loadOverview(game, result.sourceUrl || sourceUrl);
    } catch (error: any) {
      message.error(error?.error || error?.message || '刷新失败');
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
      const stockMap = new Map<string, ResourceTask>((result.tasks || []).map((item: ResourceTask) => [item.id, item]));
      setResources((items) => {
        if (!items.length) return result.tasks || [];
        return items.map((item) => ({ ...item, ...(stockMap.get(item.id) || {}) }));
      });
      const failed = (result.tasks || []).filter((item: ResourceTask) => item.queryError || item.queryMessage).length;
      message.success(failed ? `库存已更新，${failed} 个资源查询异常` : `库存已更新，共 ${result.tasks?.length || 0} 个资源`);
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
        targetTime: values.targetTime?.format(TASK_TIME_FORMAT),
        interval: values.interval,
        holdtime: values.holdtime,
        selectedTasks,
      });
      const created = result as any;
      dispatch(addTask(created));
      setActiveTaskId(created.id);
      const started = await window.api.tasks.start(created.id);
      dispatch(upsertTask((started as any)?.id ? started : created));
      message.success('定时抢码任务已启动');
    } catch (error: any) {
      message.error(error?.error || error?.message || '创建失败，请检查参数');
    } finally {
      setLoading(false);
    }
  };

  const buildTaskConfig = async () => {
    const values = await form.validateFields();
    const selectedTasks = resources.filter((item) => selectedIds.includes(item.id));
    if (selectedTasks.length === 0) throw new Error('请选择至少一个资源道具');
    return {
      type: 'grab_code',
      game: values.game,
      name: values.name || '定时抢码任务',
      targetTime: '',
      interval: values.interval,
      holdtime: values.holdtime,
      selectedTasks,
    };
  };

  const saveWorkflow = async () => {
    setLoading(true);
    try {
      const taskConfig = await buildTaskConfig();
      const workflowValues = await workflowForm.validateFields();
      const result = await window.api.tasks.saveWorkflow({
        ...workflowValues,
        targetTime: workflowValues.targetTime?.format(TASK_TIME_FORMAT),
        taskConfig,
      });
      if (result?.workflow?.id) workflowForm.setFieldValue('id', result.workflow.id);
      setTaskWorkflows(result?.workflows || []);
      message.success('抢码工作流已保存');
    } catch (error: any) {
      message.error(error?.message || '抢码工作流保存失败');
    } finally {
      setLoading(false);
    }
  };

  const newWorkflow = () => {
    workflowForm.setFieldsValue({
      id: undefined,
      name: '抢码自动化工作流',
      repeat: 'once',
      enabled: true,
      targetTime: dayjs().add(1, 'hour'),
    });
    message.info('已切换为新建抢码工作流');
  };

  const editWorkflow = async (workflow: any) => {
    workflowForm.setFieldsValue({ ...workflow, targetTime: workflow.targetTime ? dayjs(workflow.targetTime) : undefined });
    if (workflow.taskConfig) {
      form.setFieldsValue({ ...workflow.taskConfig, targetTime: workflow.taskConfig.targetTime ? dayjs(workflow.taskConfig.targetTime) : undefined });
      if (workflow.taskConfig.game) await handleGameChange(workflow.taskConfig.game);
      setSelectedIds((workflow.taskConfig.selectedTasks || []).map((item: ResourceTask) => item.id));
    }
    message.info('已载入抢码工作流');
  };

  const runWorkflowNow = async (workflowId: string) => {
    setLoading(true);
    try {
      const result = await window.api.tasks.runWorkflow(workflowId);
      setTaskWorkflows(result?.workflows || []);
      message.success('抢码工作流已执行');
      await loadTasks();
    } catch (error: any) {
      message.error(error?.message || '抢码工作流执行失败');
    } finally {
      setLoading(false);
    }
  };

  const deleteWorkflow = (workflowId: string) => {
    Modal.confirm({
      title: '删除这个抢码工作流？',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        const result = await window.api.tasks.deleteWorkflow(workflowId);
        setTaskWorkflows(result?.workflows || []);
        if (workflowForm.getFieldValue('id') === workflowId) workflowForm.resetFields();
        message.success('抢码工作流已删除');
      },
    });
  };

  const workflowDescription = (workflow: any) => {
    const config = workflow.taskConfig || {};
    const selected = config.selectedTasks || [];
    const resourceNames = selected.slice(0, 3).map((item: ResourceTask) => item.name || item.taskName || item.awardName || item.id).join('、');
    const more = selected.length > 3 ? ` 等 ${selected.length} 个资源` : `${selected.length} 个资源`;
    return (
      <Space direction="vertical" size={2}>
        <Typography.Text style={{ color: 'var(--bt-text-secondary)', fontSize: 12 }}>
          游戏 {gameName(config.game)} · {resourceNames ? `${resourceNames}${selected.length > 3 ? '' : ''}` : '未选择资源'} · {more}
        </Typography.Text>
        <Typography.Text style={{ color: 'var(--bt-text-secondary)', fontSize: 12 }}>
          间隔 {config.interval ?? '-'} 秒 · 自动停止 {config.holdtime ?? '-'} 秒 · 下次触发 {workflow.nextRunAt || '-'}
        </Typography.Text>
        {workflow.lastError ? <Typography.Text type="danger" style={{ fontSize: 12 }}>{workflow.lastError}</Typography.Text> : null}
      </Space>
    );
  };

  const handleStop = async (taskId: string) => {
    try {
      await window.api.tasks.stop(taskId);
      dispatch(stopTask(taskId));
      message.success('任务已停止');
      await loadTasks();
    } catch (error: any) {
      message.error(error?.error || error?.message || '停止失败');
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      await window.api.tasks.delete(taskId);
      dispatch(removeTask(taskId));
      if (activeTaskId === taskId) setActiveTaskId(null);
      message.success('任务已删除');
      await loadTasks();
    } catch (error: any) {
      message.error(error?.error || error?.message || '删除失败');
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

      <Row gutter={16} className="bt-equal-row">
        <Col xs={24} lg={9}>
          <Card title="选择资源道具 + 定时抢码" className="bt-fill-card">
            <Form form={form} layout="vertical" initialValues={{ interval: 0.3, holdtime: 30 }} className="bt-card-form">
              <div className="bt-card-form-scroll">
              <Form.Item name="name" label="任务名称">
                <Select placeholder="选择模板名称或留空" allowClear onChange={saveFormValues}>
                  <Select.Option value="定时抢码任务">定时抢码任务</Select.Option>
                  <Select.Option value="到点跳过验证码任务">到点跳过验证码任务</Select.Option>
                </Select>
              </Form.Item>
              <Form.Item name="game" label="游戏配置" rules={[{ required: true, message: '请选择游戏' }]}>
                <Select placeholder="选择游戏" autoFocus onChange={handleGameChange}>
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
                extra={resources.some((item) => item.stockFetchedAt) ? `最近库存更新时间：${resources.find((item) => item.stockFetchedAt)?.stockFetchedAt}` : `共 ${resources.length} 个资源`}
              >
                <Space style={{ marginBottom: 8 }} wrap>
                  <Button size="small" icon={<ReloadOutlined />} loading={stockLoading} onClick={() => handleQueryStocks(false)}>查询库存</Button>
                  <Button size="small" loading={stockLoading} disabled={!selectedIds.length} onClick={() => handleQueryStocks(true)}>查询选中库存</Button>
                </Space>
                <Input
                  placeholder="搜索资源名称或 ID..."
                  allowClear
                  value={resourceSearch}
                  onChange={(e) => setResourceSearch(e.target.value)}
                  style={{ marginBottom: 8 }}
                  prefix={<span style={{ opacity: 0.4, fontSize: 12 }}>🔍</span>}
                />
                <div className="bt-resource-list bt-resource-list-fill">
                  <Checkbox.Group value={selectedIds} onChange={(ids) => { setSelectedIds(ids as string[]); saveFormValues(); }}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {filteredResources.map((item) => (
                        <div key={item.id} className="bt-resource-item">
                          <Checkbox value={item.id}>
                            <Space size={6} wrap>
                              <span style={{ color: 'var(--bt-text-primary)' }}>{item.name || item.taskName || item.id}</span>
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
                        </div>
                      ))}
                    </Space>
                  </Checkbox.Group>
                  {filteredResources.length === 0 && resources.length > 0 && (
                    <div className="bt-empty-state" style={{ padding: 'var(--bt-space-4)' }}>
                      <span className="bt-empty-state-text">无匹配资源</span>
                    </div>
                  )}
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
              </div>
              <div className="bt-card-form-footer">
                <Button block type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={handleCreateAndStart}>启动抢码任务</Button>
              </div>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={15}>
          <div className="bt-card-stack">
          <Card title="任务列表" className="bt-stack-card bt-stack-card-primary" extra={<Button icon={<ReloadOutlined />} onClick={loadTasks}>刷新</Button>}>
            <Table rowKey="id" size="small" dataSource={tasks} columns={columns} pagination={{ pageSize: 5 }} scroll={{ y: 220 }} />
          </Card>
          <Card title={activeTask ? `执行日志 - ${activeTask.config?.name || activeTask.id}` : '执行日志'} className="bt-stack-card bt-stack-card-secondary">
            {/* Log window */}
            <div className="bt-log-window bt-log-window-fill" role="log" aria-label="任务执行日志" aria-live="polite">
              {!((activeTask as any)?.logs?.length) && (
                <div className="bt-empty-state" role="status">
                  <Typography.Text style={{ color: 'var(--bt-text-disabled)' }}>暂无日志</Typography.Text>
                </div>
              )}
              {((activeTask as any)?.logs || []).map((log: any, idx: number) => (
                <div key={`task-log-${activeTask?.id}-${idx}`} className="bt-log-entry">
                  <span className="bt-log-time">{log.time}</span>
                  <Tag color={log.level === 'error' ? 'red' : log.level === 'warning' ? 'gold' : log.level === 'success' ? 'green' : 'blue'} className="bt-log-level">{log.level}</Tag>
                  <span className="bt-log-message" style={{ color: log.level === 'error' ? 'var(--bt-error)' : log.level === 'warning' ? 'var(--bt-warning)' : 'var(--bt-text-secondary)' }}>{log.message}</span>
                </div>
              ))}
              <div />
            </div>
          </Card>
          </div>
        </Col>
      </Row>
      <Card title="抢码自动化工作流" className="bt-workflow-card" style={{ marginTop: 16 }}>
        <Form form={workflowForm} layout="vertical">
          <Form.Item name="id" hidden><Input /></Form.Item>
          <Row gutter={[16, 8]} align="bottom">
            <Col xs={24} sm={12} xl={6}>
              <Form.Item name="name" label="工作流名称" style={workflowFormItemStyle} rules={[{ required: true, message: '请输入工作流名称' }]}>
                <Input placeholder="例如：每天定时抢码" />
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
          dataSource={taskWorkflows}
          locale={{ emptyText: '暂无抢码工作流' }}
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
                description={workflowDescription(workflow)}
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
};

export default TasksPage;
