import { NextRequest, NextResponse } from 'next/server';
import {
  getAllLicenses,
  generateLicenseCode,
  toggleLicenseDisabled,
  deleteLicense,
} from '@/lib/license-store';

// 管理员密码
const ADMIN_PASSWORD = 'LIHUO808123';

// 验证管理员密码
function verifyAdminAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const password = authHeader.replace('Bearer ', '');
  return password === ADMIN_PASSWORD;
}

// GET - 获取所有授权码列表
export async function GET(request: NextRequest) {
  if (!verifyAdminAuth(request)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const licenses = getAllLicenses();
  return NextResponse.json({ licenses });
}

// POST - 生成新授权码
export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { unlimited, note, count = 1 } = body;

    const newLicenses = [];
    for (let i = 0; i < count; i++) {
      const license = generateLicenseCode(unlimited, note);
      newLicenses.push(license);
    }

    return NextResponse.json({ licenses: newLicenses });
  } catch (error) {
    return NextResponse.json({ error: '生成失败' }, { status: 500 });
  }
}

// PUT - 禁用/启用授权码
export async function PUT(request: NextRequest) {
  if (!verifyAdminAuth(request)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { code, action } = body;

    if (action === 'toggle') {
      const disabled = toggleLicenseDisabled(code);
      return NextResponse.json({ success: true, disabled });
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}

// DELETE - 删除授权码
export async function DELETE(request: NextRequest) {
  if (!verifyAdminAuth(request)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json({ error: '缺少授权码' }, { status: 400 });
    }

    const success = deleteLicense(code);
    return NextResponse.json({ success });
  } catch (error) {
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}
