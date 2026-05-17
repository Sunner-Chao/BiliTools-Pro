import React, { useEffect, useState, useCallback } from 'react';
import { Card, Typography, Spin, Result, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface QRLoginProps {
  onSuccess: (user: unknown) => void;
}

const QRLogin: React.FC<QRLoginProps> = ({ onSuccess }) => {
  const [qrUrl, setQrUrl] = useState('');
  const [qrKey, setQrKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'pending' | 'scanned' | 'success' | 'expired' | 'error'>('pending');
  const [message, setMessage] = useState('');

  const fetchQRCode = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.api.auth.loginByQR();
      if (result.success) {
        setQrUrl(result.qrUrl);
        setQrKey(result.qrKey);
        setStatus('pending');
        setMessage('请使用哔哩哔哩APP扫描二维码');
      } else {
        setStatus('error');
        setMessage(result.error || '获取二维码失败');
      }
    } catch {
      setStatus('error');
      setMessage('获取二维码失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQRCode(); }, [fetchQRCode]);

  useEffect(() => {
    if (!qrKey || status === 'success' || status === 'expired') return;
    const interval = setInterval(async () => {
      try {
        const result = await window.api.auth.checkQRStatus(qrKey);
        setStatus(result.status);
        setMessage(result.message || '');
        if (result.status === 'success') {
          clearInterval(interval);
          onSuccess(result.user);
        }
      } catch {
        setStatus('error');
        setMessage('检查登录状态失败');
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [qrKey, status, onSuccess]);

  if (loading) return <Card style={{ textAlign: 'center', padding: 24 }}><Spin size="large" tip="获取二维码中..." /></Card>;
  if (status === 'error' || status === 'expired') return <Card style={{ textAlign: 'center', padding: 24 }}><Result status={status === 'error' ? 'error' : 'warning'} title={status === 'error' ? '获取二维码失败' : '二维码已过期'} subTitle={message} extra={<Button icon={<ReloadOutlined />} onClick={fetchQRCode}>重试</Button>} /></Card>;

  return (
    <Card style={{ textAlign: 'center', padding: 24 }}>
      <Title level={4}>扫码登录</Title>
      <div style={{ marginBottom: 16 }}><img src={qrUrl} alt="QR Code" style={{ width: 200, height: 200, border: '1px solid #f0f0f0' }} /></div>
      <Text type="secondary">{message}</Text>
    </Card>
  );
};

export default QRLogin;