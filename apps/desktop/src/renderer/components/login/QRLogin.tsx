import React, { useEffect, useState, useCallback } from 'react';
import { Typography, Button } from 'antd';
import { ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, ScanOutlined } from '@ant-design/icons';

const { Text } = Typography;

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
    setStatus('pending');
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

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <div style={{
          width: 40, height: 40, margin: '0 auto 16px',
          border: '3px solid var(--bt-border)', borderTopColor: 'var(--bt-primary)',
          borderRadius: '50%', animation: 'bt-spin 0.8s linear infinite',
        }} />
        <Text style={{ color: 'var(--bt-text-secondary)' }}>获取二维码中...</Text>
        <style>{`@keyframes bt-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const renderStatus = () => {
    switch (status) {
      case 'scanned':
        return (
          <div className="bt-qr-overlay">
            <CheckCircleOutlined style={{ fontSize: 32, color: 'var(--bt-primary)' }} />
            <span>已扫码，请在手机确认</span>
          </div>
        );
      case 'success':
        return (
          <div className="bt-qr-overlay">
            <CheckCircleOutlined style={{ fontSize: 32, color: 'var(--bt-success)' }} />
            <span>登录成功！正在跳转...</span>
          </div>
        );
      case 'expired':
      case 'error':
        return (
          <div className="bt-qr-overlay">
            <CloseCircleOutlined style={{ fontSize: 32, color: 'var(--bt-error)' }} />
            <span>{status === 'expired' ? '二维码已过期' : message || '获取失败'}</span>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={fetchQRCode}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.3)',
                color: 'white',
                borderRadius: '8px',
                marginTop: 4,
              }}
            >
              重新获取
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ textAlign: 'center', padding: '16px 0' }}>
      <div className={`bt-qr-box ${status === 'pending' ? 'scanning' : ''}`}>
        {qrUrl ? (
          <img src={qrUrl} alt="QR Code" style={{ width: '100%', height: '100%', display: 'block' }} />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 8, color: 'var(--bt-text-secondary)', fontSize: 14,
          }}>
            <ScanOutlined style={{ fontSize: 24 }} />
            <span>生成中...</span>
          </div>
        )}
        {renderStatus()}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 6, color: 'var(--bt-text-secondary)', fontSize: 13,
      }}>
        <ScanOutlined style={{ fontSize: 14 }} />
        <span>{message || '请使用B站手机客户端扫码登录'}</span>
      </div>
    </div>
  );
};

export default QRLogin;
