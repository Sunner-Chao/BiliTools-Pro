import React, { useEffect, useState } from 'react';
import { Button, Card, Col, Descriptions, Progress, Row, Space, Statistic, Table, Tag } from 'antd';
import { CheckCircleOutlined, KeyOutlined, PlayCircleOutlined, ReloadOutlined, ThunderboltOutlined, VideoCameraOutlined } from '@ant-design/icons';

const AnalyticsPage: React.FC = () => {
  const [data, setData] = useState<any>({ games: [], recent: [], streaming: {} });

  const load = async () => {
    setData(await window.api.analytics.summary());
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>数据统计</h1>
        <Space>
          <span style={{ color: '#999', fontSize: 12 }}>更新于 {data.updatedAt || '-'}</span>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
        </Space>
      </Space>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="总任务数" value={data.totalTasks || 0} suffix="个" prefix={<ThunderboltOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="完成任务" value={data.completedTasks || 0} suffix="个" prefix={<CheckCircleOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="成功率" value={data.successRate || 0} suffix="%" precision={1} prefix={<PlayCircleOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="推流状态" value={data.streaming?.isStreaming ? '直播中' : '未直播'} prefix={<VideoCameraOutlined />} valueStyle={{ color: data.streaming?.isStreaming ? '#52c41a' : '#999' }} /></Card></Col>
      </Row>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="运行/等待" value={data.runningTasks || 0} suffix="个" /></Card></Col>
        <Col span={6}><Card><Statistic title="失败任务" value={data.failedTasks || 0} suffix="个" valueStyle={{ color: (data.failedTasks || 0) ? '#cf1322' : undefined }} /></Card></Col>
        <Col span={6}><Card><Statistic title="接口结果" value={data.resultCount || 0} suffix="条" /></Card></Col>
        <Col span={6}><Card><Statistic title="兑换码记录" value={data.cdkeyCount || 0} suffix="个" prefix={<KeyOutlined />} /></Card></Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="游戏任务统计">
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
          <Card title="最近任务">
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
          <Card title="账号与凭证">
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
          <Card title="每日任务观众槽位">
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
