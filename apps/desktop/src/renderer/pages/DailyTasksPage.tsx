import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Divider, Form, Input, InputNumber, List, message, Modal, Row, Select, Space, Table, Tag, Typography } from 'antd';
import { CheckCircleOutlined, GiftOutlined, LoginOutlined, MessageOutlined, QrcodeOutlined, ReloadOutlined, VideoCameraOutlined, WalletOutlined } from '@ant-design/icons';
import { useAppSelector } from '../store/hooks';

const DailyTasksPage: React.FC = () => {
  const user = useAppSelector((state) => state.auth.user);
  const [form] = Form.useForm();
  const [cookieForm] = Form.useForm();
  const [status, setStatus] = useState<any>({ slots: [], logs: [] });
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [qrInfo, setQrInfo] = useState<any>(null);
  const [qrMessage, setQrMessage] = useState('');
  const [rechargeInfo, setRechargeInfo] = useState<any>(null);
  const [rechargeOrder, setRechargeOrder] = useState<any>(null);
  const [customRechargeAmount, setCustomRechargeAmount] = useState<number | null>(60);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadStatus = async () => {
    try {
      const result = await window.api.daily.status();
      setStatus(result || { slots: [], logs: [] });
      if (loadError) setLoadError('');
    } catch {
      setLoadError('加载失败，请检查后端服务');
      if (pageLoading) setPageLoading(false);
    } finally {
      if (pageLoading) setPageLoading(false);
    }
  };

  useEffect(() => {
    form.setFieldsValue({ roomId: user?.roomId ? String(user.roomId) : '', durationMinutes: 16, entryMode: 'browser', message: '' });
    loadStatus();
    const timer = window.setInterval(loadStatus, 2000);
    return () => window.clearInterval(timer);
  }, [user?.roomId]);

  useEffect(() => {
    if (!qrInfo?.qrKey) return undefined;
    const timer = window.setInterval(async () => {
      const result = await window.api.daily.checkAudienceQRStatus(qrInfo.qrKey);
      setQrMessage(result?.message || result?.status || '');
      if (result?.status === 'success') {
        message.success(`观众 ${result.slot} 扫码登录成功`);
        setActiveSlot(null);
        setQrInfo(null);
        await loadStatus();
      } else if (['expired', 'failed', 'error'].includes(result?.status)) {
        message.warning(result?.message || '扫码失败');
        window.clearInterval(timer);
      }
    }, 1600);
    return () => window.clearInterval(timer);
  }, [qrInfo?.qrKey]);

  const run = async (action: (values: any) => Promise<any>, okText: string) => {
    setLoading(true);
    try {
      const values = await form.validateFields();
      const result = await action(values);
      message.success(okText);
      await loadStatus();
    } catch (error: any) {
      const errMsg = error?.response?.message || error?.error || error?.message || '操作失败';
      message.warning(errMsg);
    } finally { setLoading(false); }
  };

  const generateQR = async (slot: number) => {
    setLoading(true);
    setQrMessage('');
    try {
      const result = await window.api.daily.audienceQR(slot);
      if (result?.qrUrl) { setQrInfo(result); setQrMessage(''); }
      else { message.error(result?.error || '二维码生成失败'); }
    } catch (error: any) {
      message.error(error?.message || '二维码生成失败');
    } finally { setLoading(false); }
  };

  const saveCookie = async () => {
    if (activeSlot === null) return;
    setLoading(true);
    try {
      const values = await cookieForm.validateFields();
      await window.api.daily.saveAudienceCookie(activeSlot, values.cookie);
      message.success('观众凭证已保存');
      setActiveSlot(null);
      cookieForm.resetFields();
      await loadStatus();
    } catch (error: any) {
      message.error(error?.error || error?.message || '保存失败');
    } finally { setLoading(false); }
  };

  const refreshWallet = async (slot: number) => {
    setLoading(true);
    try {
      const result = await window.api.daily.wallet(slot);
      message.success(`钱包余额 ${result.wallet?.goldText || '-'}`);
      await loadStatus();
    } catch (error: any) {
      message.warning(error?.wallet?.error || error?.message || '余额查询失败');
    } finally { setLoading(false); }
  };

  const showRechargePanel = async (slot: number) => {
    setLoading(true);
    setRechargeOrder(null);
    try {
      const roomId = form.getFieldValue('roomId') || '';
      const result = await window.api.daily.rechargePanel(slot, roomId);
      if (result?.panel) {
        setRechargeInfo({ ...result, slot });
      } else {
        message.warning(result?.error || '充值面板获取失败');
      }
    } catch (error: any) {
      if (error?.panel) {
        setRechargeInfo({ ...error, slot });
        message.warning(error?.error || '充值面板部分接口返回失败，请查看详情');
      } else {
        message.warning(error?.error || error?.message || '充值面板获取失败');
      }
    } finally { setLoading(false); }
  };

  const createRechargeOrder = (option: any) => {
    if (rechargeInfo?.slot === undefined) return;
    const roomId = form.getFieldValue('roomId') || rechargeInfo?.room?.roomId || '';
    Modal.confirm({
      title: `确认创建 ${option.priceText || `${Number(option.price || 0) / 100} 电池`} 充值订单？`,
      content: '确认后将向 B 站请求支付二维码订单；仍需你手动扫码支付，当前软件不会自动付款。',
      okText: '创建订单',
      cancelText: '取消',
      onOk: async () => {
        setLoading(true);
        try {
          const result = await window.api.daily.createRechargeOrder(rechargeInfo.slot, roomId, option, true);
          setRechargeOrder(result.order);
          message.success('充值二维码订单已创建');
          await loadStatus();
        } catch (error: any) {
          message.error(error?.error || error?.order?.message || error?.message || '创建订单失败');
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const createCustomRechargeOrder = () => {
    if (!customRechargeAmount) {
      message.warning('请输入自定义充值金额');
      return;
    }
    createRechargeOrder({
      custom: true,
      amount: customRechargeAmount,
      price: Math.round(customRechargeAmount * 100),
      priceText: `${customRechargeAmount.toFixed(2)} 电池`,
    });
  };

  const queryRechargeOrder = async () => {
    if (rechargeInfo?.slot === undefined || !rechargeOrder?.orderId) return;
    setLoading(true);
    try {
      const result = await window.api.daily.queryRechargeOrder(rechargeInfo.slot, rechargeOrder.orderId);
      setRechargeOrder((current: any) => ({ ...current, status: result.order?.status, statusText: result.order?.statusText, query: result.order }));
      message.info(result.order?.statusText || '订单状态已更新');
      await loadStatus();
    } catch (error: any) {
      message.warning(error?.order?.message || error?.message || '订单查询失败');
    } finally {
      setLoading(false);
    }
  };

  const logColumns = [
    { title: '时间', dataIndex: 'time', key: 'time', width: 90 },
    { title: '级别', dataIndex: 'level', key: 'level', width: 90, render: (value: string) => <Tag color={value === 'error' ? 'red' : value === 'success' ? 'green' : 'blue'}>{value}</Tag> },
    { title: '输出', dataIndex: 'message', key: 'message', render: (value: string) => <Typography.Text style={{ whiteSpace: 'pre-wrap', color: 'var(--bt-text-secondary)' }}>{value}</Typography.Text> },
  ];

  if (pageLoading) {
    return (
      <div className="bt-page-skeleton" role="status" aria-label="加载每日任务">
        <div className="bt-page-header">
          <div className="bt-page-header-bar" aria-hidden="true" />
          <div>
            <div className="bt-skeleton" style={{ width: 180, height: 28, borderRadius: 6 }} />
            <div className="bt-skeleton" style={{ width: 240, height: 16, marginTop: 4, borderRadius: 4 }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
          <div className="bt-skeleton bt-stagger-1" style={{ height: 220, borderRadius: 20 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} className={`bt-skeleton bt-stagger-${i + 2}`} style={{ height: 180, borderRadius: 20 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div className="bt-page-header bt-animate-fade-in">
        <div className="bt-page-header-bar" />
        <div>
          <h1>每日任务系统</h1>
          <p>观众扫码身份 · 进房 · 发弹幕 · 赠送礼物</p>
        </div>
      </div>

      {loadError && (
        <Alert type="error" message={loadError} closable showIcon onClose={() => setLoadError('')} style={{ marginBottom: 16 }} action={<Button size="small" onClick={() => { setLoadError(''); loadStatus(); }}>重试</Button>} />
      )}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card title="每日任务系统">
            <Form form={form} layout="vertical">
              <Form.Item name="roomId" label="直播间号" rules={[{ required: true, message: '请输入直播间号' }]}>
                <Input placeholder="直播间号" />
              </Form.Item>
              <Form.Item name="durationMinutes" label="去直播间保持时间(分钟)">
                <InputNumber min={1} max={240} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="entryMode" label="进入方式">
                <Select
                  options={[
                    { value: 'browser', label: '可见浏览器复刻原 src' },
                    { value: 'api', label: 'API 观看心跳（轻量）' },
                    { value: 'headless', label: '无头浏览器兜底' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="message" label="弹幕内容">
                <Input placeholder="留空则随机" />
              </Form.Item>
            </Form>
          </Card>
        </Col>
        <Col xs={24} md={16}>
          <Row gutter={[12, 12]}>
            {(status.slots || []).map((slot: any) => (
              <Col xs={24} sm={12} key={slot.slot}>
                <Card
                  size="small"
                  title={<span style={{ color: 'var(--bt-text-primary)' }}>观众 {slot.slot}</span>}
                  extra={<Tag color={slot.isValid ? 'green' : slot.hasCookie ? 'gold' : 'default'}>{slot.isValid ? slot.name : slot.hasCookie ? '待验证' : '未配置'}</Tag>}
                >
                  <Space wrap>
                    <Button icon={<LoginOutlined />} onClick={() => { setActiveSlot(slot.slot); setQrInfo(null); setQrMessage(''); generateQR(slot.slot); }}>扫码验证</Button>
                    <Button loading={loading} icon={<CheckCircleOutlined />} onClick={() => run(() => window.api.daily.validateAudience(slot.slot), '身份有效')}>检查</Button>
                    <Button loading={loading} icon={<WalletOutlined />} onClick={() => refreshWallet(slot.slot)}>查余额</Button>
                    <Button loading={loading} icon={<QrcodeOutlined />} onClick={() => showRechargePanel(slot.slot)}>充值电池</Button>
                    <Button loading={loading} icon={<VideoCameraOutlined />} onClick={() => run((values) => window.api.daily.enterLiveRoom(slot.slot, values.roomId, values.durationMinutes, values.entryMode), '已进入直播间')}>去直播间</Button>
                    <Button loading={loading} icon={<MessageOutlined />} onClick={() => run((values) => window.api.daily.sendDanmaku(slot.slot, values.roomId, values.message), '弹幕已发送')}>发送弹幕*1</Button>
                    <Button loading={loading} icon={<GiftOutlined />} danger onClick={() => run((values) => window.api.daily.sendGift(slot.slot, values.roomId), '礼物请求已发送')}>赠送牛蛙*1</Button>
                  </Space>
                  <Typography.Paragraph style={{ marginTop: 12, marginBottom: slot.liveEntry ? 4 : 0, color: 'var(--bt-text-secondary)', fontSize: 12 }}>
                    钱包余额：{slot.wallet?.goldText || (slot.isValid ? '查询中' : '-')}
                  </Typography.Paragraph>
                  {slot.liveEntry ? (
                    <Typography.Paragraph style={{ marginTop: 12, marginBottom: 0, color: 'var(--bt-text-secondary)', fontSize: 12 }}>
                      已进入 {slot.liveEntry.roomId}，到 {slot.liveEntry.expiresAt}
                      {slot.liveEntry.apiWatch?.mode === 'api-watch' ? ' · API心跳' : ''}
                      {slot.liveEntry.browser?.mode === 'real-browser' ? ` · 真实浏览器 PID ${slot.liveEntry.browser.pid}` : ''}
                    </Typography.Paragraph>
                  ) : null}
                </Card>
              </Col>
            ))}
          </Row>
        </Col>
      </Row>

      <Card title="每日任务日志" style={{ marginTop: 16 }} extra={<Button icon={<ReloadOutlined />} onClick={loadStatus}>刷新</Button>}>
        <Table rowKey={(_, index) => `daily-log-${index}`} size="small" columns={logColumns} dataSource={status.logs || []} pagination={{ pageSize: 10 }} locale={{ emptyText: '暂无日志' }} />
      </Card>

      <Modal
        title={activeSlot === null ? '观众扫码验证' : `观众 ${activeSlot} 扫码验证`}
        open={activeSlot !== null}
        onCancel={() => { setActiveSlot(null); setQrInfo(null); }}
        footer={[
          <Button key="refresh" loading={loading} onClick={() => activeSlot !== null && generateQR(activeSlot)}>刷新二维码</Button>,
          <Button key="close" onClick={() => { setActiveSlot(null); setQrInfo(null); }}>关闭</Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%', alignItems: 'center' }}>
          {qrInfo?.qrUrl ? <img src={qrInfo.qrUrl} alt="观众扫码登录" style={{ width: 220, height: 220, borderRadius: 12 }} /> : <Typography.Text style={{ color: 'var(--bt-text-secondary)' }}>二维码生成中...</Typography.Text>}
          <Typography.Text style={{ color: 'var(--bt-text-secondary)' }}>{qrMessage || '请使用哔哩哔哩 APP 扫码并确认登录'}</Typography.Text>
        </Space>
        <Typography.Paragraph style={{ marginTop: 16, marginBottom: 8, color: 'var(--bt-text-secondary)', fontSize: 13 }}>
          备用：如扫码接口不可用，可手动粘贴观众 Cookie。
        </Typography.Paragraph>
        <Form form={cookieForm} layout="vertical">
          <Form.Item name="cookie" label="观众 B 站 Cookie">
            <Input.TextArea rows={3} placeholder="SESSDATA=...; bili_jct=...;" />
          </Form.Item>
          <Button block onClick={saveCookie} loading={loading}>保存手动 Cookie</Button>
        </Form>
      </Modal>

      <Modal
        title={rechargeInfo?.slot === undefined ? '充值电池' : `观众 ${rechargeInfo.slot} 充值电池`}
        open={Boolean(rechargeInfo)}
        onCancel={() => { setRechargeInfo(null); setRechargeOrder(null); }}
        footer={[
          <Button key="open" type="primary" onClick={() => rechargeInfo?.url && window.api.system.openExternal(rechargeInfo.url)}>打开直播间充值入口</Button>,
          <Button key="close" onClick={() => { setRechargeInfo(null); setRechargeOrder(null); }}>关闭</Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="已按直播间充值按钮链路拉取真实接口"
            description="当前只查询余额、充值面板、公告和资源配置；创建支付二维码订单必须由用户明确选择金额后再触发，不会在这里自动下单。"
          />
          <Space direction="vertical" style={{ width: '100%', alignItems: 'center' }}>
          {rechargeInfo?.qrUrl ? <img src={rechargeInfo.qrUrl} alt="充值电池二维码" style={{ width: 220, height: 220, borderRadius: 12 }} /> : null}
          <Typography.Text style={{ color: 'var(--bt-text-secondary)' }}>钱包余额：{rechargeInfo?.panel?.walletText || '-'}</Typography.Text>
          <Typography.Text copyable style={{ color: 'var(--bt-text-secondary)', fontSize: 12 }}>{rechargeInfo?.url || ''}</Typography.Text>
          {rechargeInfo?.componentUrl ? (
            <Typography.Text copyable style={{ color: 'var(--bt-text-disabled)', fontSize: 12 }}>组件入口：{rechargeInfo.componentUrl}</Typography.Text>
          ) : null}
          </Space>
          <Divider style={{ margin: '8px 0' }} />
          <Row gutter={[8, 8]}>
            {[
              ['钱包', rechargeInfo?.panel?.wallet],
              ['充值面板', rechargeInfo?.panel?.panel],
              ['公告', rechargeInfo?.panel?.announcement],
              ['资源配置', rechargeInfo?.panel?.clientResource],
              ['主播关系', rechargeInfo?.panel?.relation],
            ].filter(([, item]) => item).map(([label, item]: any) => (
              <Col span={12} key={label}>
                <Card size="small" title={label}>
                  <Tag color={item?.code === 0 ? 'green' : 'red'}>code={item?.code ?? '-'}</Tag>
                  <Typography.Text style={{ marginLeft: 8, fontSize: 12, color: 'var(--bt-text-secondary)' }}>
                    {item?.message || item?.msg || 'OK'}
                  </Typography.Text>
                </Card>
              </Col>
            ))}
          </Row>
          {rechargeInfo?.panel?.payOptions?.length ? (
            <List
              size="small"
              header="选择充值档位（来自 rechargePanel）"
              dataSource={rechargeInfo.panel.payOptions}
              renderItem={(item: any) => (
                <List.Item
                  actions={[
                    <Button key="create" size="small" type="primary" loading={loading} onClick={() => createRechargeOrder(item)}>下单拉取二维码</Button>,
                  ]}
                >
                  <Typography.Text>{item.priceText || `${Number(item.price || 0) / 100} 电池`}</Typography.Text>
                  <Typography.Text type="secondary">goods={item.id || '-'} index={item.index || '-'}</Typography.Text>
                </List.Item>
              )}
            />
          ) : (
            <Typography.Text style={{ color: 'var(--bt-text-secondary)', fontSize: 12 }}>未解析到充值档位，可查看接口 code 判断是否被登录态或地区风控拦截。</Typography.Text>
          )}
          <Card size="small" title="自定义金额充值">
            <Space.Compact style={{ width: '100%' }}>
              <InputNumber
                min={10}
                max={100000}
                step={10}
                precision={2}
                value={customRechargeAmount}
                addonAfter="电池"
                style={{ width: '100%' }}
                onChange={(value) => setCustomRechargeAmount(typeof value === 'number' ? value : null)}
              />
              <Button type="primary" loading={loading} onClick={createCustomRechargeOrder}>下单拉取二维码</Button>
            </Space.Compact>
            <Typography.Text style={{ display: 'block', marginTop: 8, color: 'var(--bt-text-secondary)', fontSize: 12 }}>
              自定义金额按官方组件换算：10 电池 = 1 元，最小 10 电池。
            </Typography.Text>
          </Card>
          <Typography.Paragraph style={{ marginBottom: 0, color: 'var(--bt-text-secondary)', fontSize: 12 }}>
            createQrCodeOrder 会在点击“下单拉取二维码”并确认后调用；queryOrderStatus 用于手动刷新订单状态。
          </Typography.Paragraph>
          {rechargeOrder ? (
            <Card size="small" title="当前充值订单">
              <Space direction="vertical" style={{ width: '100%', alignItems: 'center' }}>
                {rechargeOrder.qrUrl ? <img src={rechargeOrder.qrUrl} alt="充值支付二维码" style={{ width: 220, height: 220, borderRadius: 12 }} /> : null}
                <Typography.Text copyable style={{ fontSize: 12, color: 'var(--bt-text-secondary)' }}>订单号：{rechargeOrder.orderId || '-'}</Typography.Text>
                <Typography.Text style={{ fontSize: 12, color: 'var(--bt-text-secondary)' }}>状态：{rechargeOrder.statusText || '待支付'}</Typography.Text>
                {rechargeOrder.codeUrl ? <Typography.Text copyable style={{ fontSize: 12, color: 'var(--bt-text-disabled)' }}>{rechargeOrder.codeUrl}</Typography.Text> : null}
                <Button loading={loading} onClick={queryRechargeOrder}>刷新支付状态</Button>
              </Space>
            </Card>
          ) : null}
        </Space>
      </Modal>
    </div>
  );
};

export default DailyTasksPage;
