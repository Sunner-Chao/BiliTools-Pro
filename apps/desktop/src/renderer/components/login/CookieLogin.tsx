import React, { useState } from 'react';
import { Input, Button, message } from 'antd';
import { LoginOutlined } from '@ant-design/icons';

const { TextArea } = Input;

interface CookieLoginProps {
  onSuccess: (user: unknown) => void;
}

const CookieLogin: React.FC<CookieLoginProps> = ({ onSuccess }) => {
  const [cookie, setCookie] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!cookie.trim()) {
      message.error('请输入Cookie');
      return;
    }
    setLoading(true);
    try {
      const result = await window.api.auth.loginByCookie(cookie);
      if (result.success) {
        message.success('登录成功');
        onSuccess(result.user);
      } else {
        message.error(result.error || '登录失败');
      }
    } catch {
      message.error('登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{
          fontSize: 14, fontWeight: 600,
          color: 'var(--bt-text-primary)', marginBottom: 8,
        }}>
          Cookie 登录
        </div>
        <div style={{
          fontSize: 13, color: 'var(--bt-text-secondary)', marginBottom: 16,
          lineHeight: 1.6,
        }}>
          从浏览器中复制B站Cookie粘贴到下方
        </div>
      </div>
      <TextArea
        rows={4}
        placeholder="SESSDATA=...; bili_jct=...; DedeUserID=..."
        value={cookie}
        onChange={(e) => setCookie(e.target.value)}
        style={{ marginBottom: 16 }}
      />
      <Button
        type="primary"
        icon={<LoginOutlined />}
        loading={loading}
        onClick={handleLogin}
        block
      >
        登录
      </Button>
    </div>
  );
};

export default CookieLogin;
