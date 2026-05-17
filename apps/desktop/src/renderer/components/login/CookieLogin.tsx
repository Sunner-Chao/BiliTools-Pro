import React, { useState } from 'react';
import { Card, Typography, Input, Button, message, Space } from 'antd';
import { LoginOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;
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
    <Card style={{ padding: 24 }}>
      <Title level={4}>Cookie登录</Title>
      <Paragraph type="secondary">从浏览器中复制B站Cookie粘贴到下方</Paragraph>
      <Space direction="vertical" style={{ width: '100%' }}>
        <TextArea rows={4} placeholder="请输入Cookie..." value={cookie} onChange={(e) => setCookie(e.target.value)} />
        <Button type="primary" icon={<LoginOutlined />} loading={loading} onClick={handleLogin} block>
          登录
        </Button>
      </Space>
    </Card>
  );
};

export default CookieLogin;