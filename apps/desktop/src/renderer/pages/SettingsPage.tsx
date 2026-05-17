import React, { useEffect, useState } from 'react';
import { Button, Card, Descriptions, Form, Input, InputNumber, message, Select, Space, Switch, Table, Tabs, Tag } from 'antd';
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons';

const SettingsPage: React.FC = () => {
  const [form] = Form.useForm();
  const [state, setState] = useState<any>({ settings: {}, resources: {}, games: [], backend: {}, credential: {} });
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const result = await window.api.settings.get();
    setState(result || {});
    form.setFieldsValue(result?.settings || {});
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setLoading(true);
    try {
      const values = await form.validateFields();
      const result = await window.api.settings.save(values);
      if (result?.success) {
        message.success('设置已保存');
        await load();
      }
    } finally {
      setLoading(false);
    }
  };

  const gameColumns = [
    { title: '游戏', dataIndex: 'name', key: 'name' },
    { title: '配置ID', dataIndex: 'id', key: 'id' },
    { title: '资源任务数', dataIndex: 'taskCount', key: 'taskCount' },
    { title: '分区', dataIndex: 'areaV2', key: 'areaV2' },
    { title: '状态', dataIndex: 'loaded', key: 'loaded', render: (loaded: boolean) => <Tag color={loaded ? 'green' : 'red'}>{loaded ? '已加载' : '缺失'}</Tag> },
  ];

  const exeColumns = [
    { title: '文件', dataIndex: 'name', key: 'name' },
    { title: '来源', dataIndex: 'source', key: 'source', render: (value: string) => <Tag>{value}</Tag> },
    { title: '大小', dataIndex: 'size', key: 'size', render: (value: number) => formatSize(value) },
    { title: '路径', dataIndex: 'path', key: 'path' },
  ];

  const fileColumns = [
    { title: '名称', dataIndex: 'label', key: 'label', render: (value: string, row: any) => value || row.name || row.game },
    { title: '状态', dataIndex: 'exists', key: 'exists', render: (exists: boolean) => <Tag color={exists ? 'green' : 'red'}>{exists ? '存在' : '缺失'}</Tag> },
    { title: '大小', dataIndex: 'size', key: 'size', render: (value: number) => formatSize(value) },
    { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', render: (value: string) => value || '-' },
    { title: '路径', dataIndex: 'path', key: 'path' },
  ];

  const dirColumns = [
    { title: '资源', dataIndex: 'label', key: 'label' },
    { title: '状态', dataIndex: 'exists', key: 'exists', render: (exists: boolean) => <Tag color={exists ? 'green' : 'red'}>{exists ? '存在' : '缺失'}</Tag> },
    { title: '文件数', dataIndex: 'fileCount', key: 'fileCount' },
    { title: '大小', dataIndex: 'size', key: 'size', render: (value: number) => formatSize(value) },
    { title: '路径', dataIndex: 'path', key: 'path' },
  ];

  const formatSize = (size?: number) => {
    const value = Number(size || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>设置</h1>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新真实状态</Button>
      </Space>
      <Form form={form} layout="vertical">
        <Tabs
          items={[
            {
              key: 'account',
              label: '账号与凭证',
              children: (
                <Card>
                  <Descriptions bordered size="small" column={2}>
                    <Descriptions.Item label="当前账号">{state.user?.name || '未登录'}</Descriptions.Item>
                    <Descriptions.Item label="UID">{state.user?.mid || state.user?.uid || '-'}</Descriptions.Item>
                    <Descriptions.Item label="直播间">{state.user?.roomId || '-'}</Descriptions.Item>
                    <Descriptions.Item label="登录状态">{state.user?.isLogin ? <Tag color="green">有效</Tag> : <Tag>未验证</Tag>}</Descriptions.Item>
                    <Descriptions.Item label="凭证保存">{state.credential?.savedAt || '-'}</Descriptions.Item>
                    <Descriptions.Item label="凭证到期">{state.credential?.expiresAt || '-'}</Descriptions.Item>
                  </Descriptions>
                  <Form.Item name="credentialValidDays" label="凭证复用窗口(天)" style={{ marginTop: 16 }} rules={[{ required: true }]}>
                    <InputNumber min={1} max={180} style={{ width: 240 }} />
                  </Form.Item>
                  <p style={{ color: '#666' }}>打开软件时会先读取本地 Cookie；只要仍在这个窗口内且 B 站接口验证有效，就不会要求重新扫码。</p>
                  <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={save}>保存凭证策略</Button>
                </Card>
              ),
            },
            {
              key: 'resources',
              label: '资源与游戏',
              children: (
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                  <Card title="运行目录">
                    <Descriptions bordered size="small" column={1}>
                      <Descriptions.Item label="config">{state.resources?.paths?.config || '-'}</Descriptions.Item>
                      <Descriptions.Item label="cookies">{state.resources?.paths?.cookies || '-'}</Descriptions.Item>
                      <Descriptions.Item label="execute">{state.resources?.paths?.execute || '-'}</Descriptions.Item>
                      <Descriptions.Item label="backend data">{state.backend?.dataDir || '-'}</Descriptions.Item>
                      <Descriptions.Item label="backend cookies">{state.backend?.cookiesDir || '-'}</Descriptions.Item>
                    </Descriptions>
                  </Card>
                  <Card title="游戏配置">
                    <Table size="small" rowKey="id" columns={gameColumns} dataSource={state.games || []} pagination={false} />
                  </Card>
                  <Card title="配置文件状态">
                    <Table size="small" rowKey="path" columns={fileColumns} dataSource={state.resources?.configFiles || []} pagination={false} />
                  </Card>
                  <Card title="运行时文件">
                    <Table size="small" rowKey="path" columns={fileColumns} dataSource={state.resources?.runtimeFiles || []} pagination={false} />
                  </Card>
                  <Card title="补充资源目录">
                    <Table size="small" rowKey="path" columns={dirColumns} dataSource={state.resources?.extraDirs || []} pagination={false} />
                  </Card>
                  <Card title="观众 Cookie 文件">
                    <Table size="small" rowKey="slot" columns={fileColumns} dataSource={state.resources?.audienceCookieFiles || []} pagination={false} />
                  </Card>
                  <Card title="可执行文件">
                    <Table size="small" rowKey="path" columns={exeColumns} dataSource={state.resources?.executables || []} pagination={{ pageSize: 8 }} />
                  </Card>
                </Space>
              ),
            },
            {
              key: 'network',
              label: '网络',
              children: (
                <Card>
                  <Form.Item name={['network', 'timeout']} label="请求超时(秒)">
                    <InputNumber min={5} max={300} style={{ width: 240 }} />
                  </Form.Item>
                  <Form.Item name={['network', 'maxRetries']} label="最大重试次数">
                    <InputNumber min={0} max={10} style={{ width: 240 }} />
                  </Form.Item>
                  <Form.Item name={['network', 'userAgent']} label="User-Agent">
                    <Input placeholder="留空则使用默认浏览器 UA" />
                  </Form.Item>
                  <Form.Item name={['proxy', 'enabled']} label="启用代理" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                  <Form.Item name={['proxy', 'type']} label="代理类型">
                    <Select style={{ width: 240 }}>
                      <Select.Option value="http">HTTP</Select.Option>
                      <Select.Option value="https">HTTPS</Select.Option>
                      <Select.Option value="socks5">SOCKS5</Select.Option>
                    </Select>
                  </Form.Item>
                  <Form.Item name={['proxy', 'host']} label="代理地址">
                    <Input placeholder="127.0.0.1" />
                  </Form.Item>
                  <Form.Item name={['proxy', 'port']} label="代理端口">
                    <InputNumber min={1} max={65535} style={{ width: 240 }} />
                  </Form.Item>
                  <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={save}>保存网络设置</Button>
                </Card>
              ),
            },
          ]}
        />
      </Form>
    </div>
  );
};

export default SettingsPage;
