import React, { useEffect, useState } from 'react';
import { Button, Card, Col, Descriptions, Progress, Row, Space, Statistic, Table, Tag } from 'antd';
import { CheckCircleOutlined, KeyOutlined, PlayCircleOutlined, ReloadOutlined, ThunderboltOutlined, VideoCameraOutlined } from '@ant-design/icons';

const AnalyticsPage: React.FC = () => {
  const [data, setData] = useState<any>({ games: [], recent: [], streaming: {} });

  const load = async () => { setData(await window.api.analytics.summary()); };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, []);

  const statCards = [
    { title: '总任务数', value: data.totalTasks || 0, suffix: '个', icon: <ThunderboltOutlined />, color: 'var(--bt-primary)' },
    { title: '完成任务', value: data.completedTasks || 0, suffix: '个', icon: <CheckCircleOutlined />, color: 'var(--bt-success)' },
    { title: '成功率', value: data.successRate || 0, suffix: '%', icon: <PlayCircleOutlined />, color: 'var(--bt-info)' },
    { title: '推流状态', value: data.streaming?.isStreaming ? '直播中' : '未直播', icon: <VideoCameraOutlined />, color: data.streaming?.isStreaming ? 'var(--bt-success)' : 'var(--bt-text-disabled)' },
  ];

  const statCards2 = [
    { title: '运行/等待', value: data.runningTasks || 0, suffix: '个' },
    { title: '失败任务', value: data.failedTasks || 0, suffix: '个', color: (data.failedTasks || 0) ? 'var(--bt-error)' : undefined },
    { title: '接口结果', value: data.resultCount || 0, suffix: '条' },
    { title: '兑换码记录', value: data.cdkeyCount || 0, suffix: '个', icon: <KeyOutlined /> },
  ];

  return (
    <div>
      {/* Page header */}
      <div className="bt-page-header bt-animate-fade-in">
        <div className="bt-page-header-bar" />
        <div>
          <h1>数据统计</h1>
          <p>更新于 {data.updatedAt || '-'}</p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load} style={{ marginLeft: 'auto' }}>刷新</Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {statCards.map((s) => (
          <Col span={6} key={s.title}>
            <div className="bt-stat-card" style={{ padding: 20, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${s.color}10, transparent)` }} />
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${s.color}50, transparent)` }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, position: 'relative' }}>
                <span style={{ fontSize: 11, color: 'var(--bt-text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.title}</span>
                <div className="bt-stat-icon" style={{ background: `${s.color}10`, color: s.color }}>{s.icon}</div>
              </div>
              <Statistic
                value={s.value}
                suffix={s.suffix}
                valueStyle={{ color: s.color, fontWeight: 700, fontSize: 24 }}
              />
            </div>
          </Col>
        ))}
      </Row>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {statCards2.map((s) => (
          <Col span={6} key={s.title}>
            <Card>
              <Statistic title={s.title} value={s.value} suffix={s.suffix} prefix={s.icon} valueStyle={s.color ? { color: s.color } : undefined} />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 4, height: 16, borderRadius: 2, background: 'var(--bt-primary)' }} />
              <span>游戏任务统计</span>
            </div>
          }>
            <Table
              dataSource={data.games || []}
              rowKey="game"
              pagination={false}
              columns={[
                { title: '游戏', dataIndex: 'game', key: 'game' },
                { title: '已建任务', dataIndex: 'tasks', key: 'tasks' },
                { title: '可选资源', dataIndex: 'configuredTasks', key: 'configuredTasks' },
                { title: '运行', dataIndex: 'running', key: 'running' },
                { title: '失败', dataIndex: 'failed', key: 'failed' },
                { title: '完成率', dataIndex: 'rate', key: 'rate', render: (value: number) => <Progress percent={value || 0} size="small" /> },
              ]}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 4, height: 16, borderRadius: 2, background: 'var(--bt-info)' }} />
              <span>最近任务</span>
            </div>
          }>
            <Table
              dataSource={data.recent || []}
              rowKey={(_, index) => `recent-${index}`}
              pagination={{ pageSize: 8, size: 'small' }}
              size="small"
              columns={[
                { title: '时间', dataIndex: 'time', key: 'time', width: 170 },
                { title: '操作', dataIndex: 'action', key: 'action' },
                { title: '进度', dataIndex: 'progress', key: 'progress', width: 90, render: (value: number) => `${value || 0}%` },
                { title: '状态', dataIndex: 'status', key: 'status', render: (status: string) => <Tag color={status === 'completed' ? 'green' : status === 'failed' ? 'red' : status === 'running' ? 'blue' : 'gold'}>{status}</Tag> },
              ]}
              locale={{ emptyText: '暂无真实任务记录' }}
            />
          </Card>
        </Col>
      </Row>
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 4, height: 16, borderRadius: 2, background: 'var(--bt-success)' }} />
              <span>账号与凭证</span>
            </div>
          }>
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="当前账号">{data.user?.name || '未登录'}</Descriptions.Item>
              <Descriptions.Item label="UID">{data.user?.mid || data.user?.uid || '-'}</Descriptions.Item>
              <Descriptions.Item label="直播间">{data.user?.roomId || '-'}</Descriptions.Item>
              <Descriptions.Item label="凭证到期">{data.credential?.expiresAt || '-'}</Descriptions.Item>
              <Descriptions.Item label="任务日志">{data.logCount || 0} 条</Descriptions.Item>
              <Descriptions.Item label="每日任务日志">{data.dailyLogCount || 0} 条</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col span={12}>
          <Card title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 4, height: 16, borderRadius: 2, background: 'var(--bt-accent)' }} />
              <span>每日任务观众槽位</span>
            </div>
          }>
            <Table
              size="small"
              rowKey="slot"
              pagination={false}
              dataSource={data.audienceSlots || []}
              columns={[
                { title: '槽位', dataIndex: 'slot', key: 'slot', width: 70 },
                { title: '账号', dataIndex: 'name', key: 'name', render: (value: string) => value || '-' },
                { title: '状态', dataIndex: 'isValid', key: 'isValid', render: (value: boolean, row: any) => <Tag color={value ? 'green' : row.hasCookie ? 'gold' : 'default'}>{value ? '有效' : row.hasCookie ? '待验证' : '未配置'}</Tag> },
                { title: '直播间', dataIndex: ['liveEntry', 'roomId'], key: 'roomId', render: (value: string) => value || '-' },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default AnalyticsPage;
