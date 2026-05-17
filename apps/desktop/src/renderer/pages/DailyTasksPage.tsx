import React, { useEffect, useState } from 'react';
import { Button, Card, Col, Form, Input, InputNumber, message, Modal, Row, Space, Table, Tag, Typography } from 'antd';
import { CheckCircleOutlined, GiftOutlined, LoginOutlined, MessageOutlined, ReloadOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { useAppSelector } from '../store/hooks';

const DailyTasksPage: React.FC = () => {
  const user = useAppSelector((state) => state.auth.user);
  const [form] = Form.useForm();
  const [cookieForm] = Form.useForm();
  const [status, setStatus] = useState<any>({ slots: [], logs: [] });
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [qrInfo, setQrInfo] = useState<any>(null);
  const [qrMessage, setQrMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const loadStatus = async () => {
    const result = await window.api.daily.status();
    setStatus(result || { slots: [], logs: [] });
  };

  useEffect(() => {
    form.setFieldsValue({ roomId: user?.roomId ? String(user.roomId) : '', durationMinutes: 16, message: '' });
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
      if (result?.success) {
        message.success(okText);
      } else {
        message.warning(result?.response?.message || result?.error || '接口返回失败');
      }
      await loadStatus();
    } catch (error: any) {
      message.error(error?.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const generateQR = async (slot: number) => {
    setLoading(true);
    setQrMessage('');
    try {
      const result = await window.api.daily.audienceQR(slot);
      if (result?.success) {
        setQrInfo(result);
      } else {
        message.error(result?.error || '二维码生成失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const saveCookie = async () => {
    if (activeSlot === null) return;
    setLoading(true);
    try {
      const values = await cookieForm.validateFields();
      const result = await window.api.daily.saveAudienceCookie(activeSlot, values.cookie);
      result?.success ? message.success('观众凭证已保存') : message.error(result?.error || '保存失败');
      setActiveSlot(null);
      cookieForm.resetFields();
      await loadStatus();
    } finally {
      setLoading(false);
    }
  };

  const logColumns = [
    { title: '时间', dataIndex: 'time', key: 'time', width: 90 },
    { title: '级别', dataIndex: 'level', key: 'level', width: 90, render: (value: string) => <Tag color={value === 'error' ? 'red' : value === 'success' ? 'green' : 'blue'}>{value}</Tag> },
    { title: '输出', dataIndex: 'message', key: 'message', render: (value: string) => <Typography.Text style={{ whiteSpace: 'pre-wrap' }}>{value}</Typography.Text> },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={16}>
        <Col span={8}>
          <Card title="每日任务系统">
            <Form form={form} layout="vertical">
              <Form.Item name="roomId" label="直播间号" rules={[{ required: true, message: '请输入直播间号' }]}>
                <Input placeholder="直播间号" />
              </Form.Item>
              <Form.Item name="durationMinutes" label="去直播间保持时间(分钟)">
                <InputNumber min={1} max={240} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="message" label="弹幕内容">
                <Input placeholder="留空则随机" />
              </Form.Item>
            </Form>
          </Card>
        </Col>
        <Col span={16}>
          <Row gutter={[12, 12]}>
            {(status.slots || []).map((slot: any) => (
              <Col span={12} key={slot.slot}>
                <Card
                  size="small"
                  title={`观众 ${slot.slot}`}
                  extra={<Tag color={slot.isValid ? 'green' : slot.hasCookie ? 'gold' : 'default'}>{slot.isValid ? slot.name : slot.hasCookie ? '待验证' : '未配置'}</Tag>}
                >
                  <Space wrap>
                    <Button icon={<LoginOutlined />} onClick={() => { setActiveSlot(slot.slot); setQrInfo(null); setQrMessage(''); generateQR(slot.slot); }}>扫码验证</Button>
                    <Button loading={loading} icon={<CheckCircleOutlined />} onClick={() => run(() => window.api.daily.validateAudience(slot.slot), '身份有效')}>检查</Button>
                    <Button loading={loading} icon={<VideoCameraOutlined />} onClick={() => run((values) => window.api.daily.enterLiveRoom(slot.slot, values.roomId, values.durationMinutes), '已进入直播间')}>去直播间</Button>
                    <Button loading={loading} icon={<MessageOutlined />} onClick={() => run((values) => window.api.daily.sendDanmaku(slot.slot, values.roomId, values.message), '弹幕已发送')}>发送弹幕*1</Button>
                    <Button loading={loading} icon={<GiftOutlined />} danger onClick={() => run((values) => window.api.daily.sendGift(slot.slot, values.roomId), '礼物请求已发送')}>赠送牛蛙*1</Button>
                  </Space>
                  {slot.liveEntry ? <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>已进入 {slot.liveEntry.roomId}，到 {slot.liveEntry.expiresAt}</Typography.Paragraph> : null}
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
          {qrInfo?.qrUrl ? <img src={qrInfo.qrUrl} alt="观众扫码登录" style={{ width: 220, height: 220 }} /> : <Typography.Text type="secondary">二维码生成中...</Typography.Text>}
          <Typography.Text type="secondary">{qrMessage || '请使用哔哩哔哩 APP 扫码并确认登录'}</Typography.Text>
        </Space>
        <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 8 }}>备用：如扫码接口不可用，可手动粘贴观众 Cookie。</Typography.Paragraph>
        <Form form={cookieForm} layout="vertical">
          <Form.Item name="cookie" label="观众 B 站 Cookie">
            <Input.TextArea rows={3} placeholder="SESSDATA=...; bili_jct=...;" />
          </Form.Item>
          <Button block onClick={saveCookie} loading={loading}>保存手动 Cookie</Button>
        </Form>
      </Modal>
    </div>
  );
};

export default DailyTasksPage;
