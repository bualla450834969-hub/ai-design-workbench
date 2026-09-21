'use client';

import { useState, useEffect } from 'react';

interface License {
  code: string;
  createdAt: number;
  unlimited: boolean;
  disabled: boolean;
  note?: string;
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(false);
  const [newCount, setNewCount] = useState(1);
  const [newUnlimited, setNewUnlimited] = useState(false);
  const [newNote, setNewNote] = useState('');

  // 加载授权码列表
  const loadLicenses = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/licenses', {
        headers: { Authorization: `Bearer ${password}` },
      });
      const data = await res.json();
      if (data.licenses) {
        setLicenses(data.licenses);
      }
    } catch (error) {
      console.error('加载失败', error);
    }
    setLoading(false);
  };

  // 登录
  const handleLogin = async () => {
    try {
      const res = await fetch('/api/admin/licenses', {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        setIsLoggedIn(true);
        loadLicenses();
      } else {
        alert('密码错误');
      }
    } catch (error) {
      alert('登录失败');
    }
  };

  // 生成新授权码
  const handleGenerate = async () => {
    try {
      const res = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${password}`,
        },
        body: JSON.stringify({
          count: newCount,
          unlimited: newUnlimited,
          note: newNote,
        }),
      });
      const data = await res.json();
      if (data.licenses) {
        alert(`成功生成 ${data.licenses.length} 个授权码`);
        loadLicenses();
        setNewNote('');
      }
    } catch (error) {
      alert('生成失败');
    }
  };

  // 禁用/启用
  const handleToggle = async (code: string) => {
    try {
      const res = await fetch('/api/admin/licenses', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${password}`,
        },
        body: JSON.stringify({ code, action: 'toggle' }),
      });
      const data = await res.json();
      if (data.success) {
        loadLicenses();
      }
    } catch (error) {
      alert('操作失败');
    }
  };

  // 删除
  const handleDelete = async (code: string) => {
    if (!confirm(`确定要删除授权码 ${code} 吗？`)) return;
    try {
      const res = await fetch(`/api/admin/licenses?code=${encodeURIComponent(code)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${password}` },
      });
      const data = await res.json();
      if (data.success) {
        loadLicenses();
      }
    } catch (error) {
      alert('删除失败');
    }
  };

  // 复制授权码
  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    alert('已复制到剪贴板');
  };

  // 登录页
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 w-full max-w-md border border-white/20">
          <h1 className="text-2xl font-bold text-white text-center mb-6">授权码管理后台</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入管理员密码"
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/50 mb-4 focus:outline-none focus:border-blue-400"
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          <button
            onClick={handleLogin}
            className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors"
          >
            登录
          </button>
        </div>
      </div>
    );
  }

  // 管理后台主页面
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">授权码管理后台</h1>

        {/* 生成新授权码 */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20 mb-6">
          <h2 className="text-xl font-bold text-white mb-4">生成新授权码</h2>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-white/70 text-sm mb-2">数量</label>
              <input
                type="number"
                min="1"
                max="100"
                value={newCount}
                onChange={(e) => setNewCount(parseInt(e.target.value) || 1)}
                className="w-24 px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-white/70 text-sm mb-2">类型</label>
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={newUnlimited}
                  onChange={(e) => setNewUnlimited(e.target.checked)}
                  className="w-4 h-4"
                />
                无限设备（测试员）
              </label>
            </div>
            <div>
              <label className="block text-white/70 text-sm mb-2">备注</label>
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="例如：客户A的授权码"
                className="w-48 px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none"
              />
            </div>
            <button
              onClick={handleGenerate}
              className="px-6 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white font-medium transition-colors"
            >
              生成
            </button>
          </div>
        </div>

        {/* 授权码列表 */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">授权码列表</h2>
            <button
              onClick={loadLicenses}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              刷新
            </button>
          </div>

          {loading ? (
            <div className="text-white/70 text-center py-8">加载中...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="text-left py-3 px-4 text-white/70">授权码</th>
                    <th className="text-left py-3 px-4 text-white/70">类型</th>
                    <th className="text-left py-3 px-4 text-white/70">状态</th>
                    <th className="text-left py-3 px-4 text-white/70">备注</th>
                    <th className="text-left py-3 px-4 text-white/70">创建时间</th>
                    <th className="text-left py-3 px-4 text-white/70">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {licenses.map((license) => (
                    <tr key={license.code} className="border-b border-white/10">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-mono">{license.code}</span>
                          <button
                            onClick={() => handleCopy(license.code)}
                            className="text-white/50 hover:text-white text-sm"
                          >
                            复制
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {license.unlimited ? (
                          <span className="px-2 py-1 rounded-full bg-purple-500/20 text-purple-300 text-sm">
                            无限设备
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full bg-blue-500/20 text-blue-300 text-sm">
                            普通（3设备）
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {license.disabled ? (
                          <span className="px-2 py-1 rounded-full bg-red-500/20 text-red-300 text-sm">
                            已禁用
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full bg-green-500/20 text-green-300 text-sm">
                            正常
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-white/70">{license.note || '-'}</td>
                      <td className="py-3 px-4 text-white/70">
                        {new Date(license.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleToggle(license.code)}
                            className="px-3 py-1 rounded-lg bg-yellow-500/20 text-yellow-300 text-sm hover:bg-yellow-500/30"
                          >
                            {license.disabled ? '启用' : '禁用'}
                          </button>
                          <button
                            onClick={() => handleDelete(license.code)}
                            className="px-3 py-1 rounded-lg bg-red-500/20 text-red-300 text-sm hover:bg-red-500/30"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
