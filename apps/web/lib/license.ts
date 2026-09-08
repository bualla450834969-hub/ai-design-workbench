// 授权码管理模块
// 支持本地内存存储（开发）和 Upstash Redis（生产）

const MAX_DEVICES_PER_LICENSE = 3;

// 内存存储（开发用）
const memoryStore = new Map<string, Set<string>>(); // licenseCode -> Set<deviceId>

// 获取授权码列表（从环境变量）
function getValidLicenseCodes(): string[] {
  const codes = process.env.LICENSE_CODES || process.env.APP_ACCESS_CODE || "";
  return codes
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

// 检查是否配置了 Redis
function hasRedis(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

// Redis 操作
async function redisCommand(command: string, ...args: (string | number)[]): Promise<any> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;

  const res = await fetch(`${url}/${command}/${args.join("/")}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.result;
}

// 获取授权码已绑定的设备列表
async function getBoundDevices(licenseCode: string): Promise<string[]> {
  const key = `license:${licenseCode}:devices`;

  if (hasRedis()) {
    try {
      const devices = await redisCommand("SMEMBERS", key);
      return Array.isArray(devices) ? devices : [];
    } catch {
      return [];
    }
  }

  // 内存存储
  const set = memoryStore.get(key);
  return set ? Array.from(set) : [];
}

// 绑定设备
async function bindDevice(licenseCode: string, deviceId: string): Promise<boolean> {
  const key = `license:${licenseCode}:devices`;

  if (hasRedis()) {
    try {
      await redisCommand("SADD", key, deviceId);
      // 设置过期时间（可选，比如1年）
      await redisCommand("EXPIRE", key, 60 * 60 * 24 * 365);
      return true;
    } catch {
      return false;
    }
  }

  // 内存存储
  if (!memoryStore.has(key)) {
    memoryStore.set(key, new Set());
  }
  memoryStore.get(key)!.add(deviceId);
  return true;
}

// 检查设备是否已绑定该授权码
async function isDeviceBound(licenseCode: string, deviceId: string): Promise<boolean> {
  const devices = await getBoundDevices(licenseCode);
  return devices.includes(deviceId);
}

// 验证授权码并绑定设备
// 返回: { valid: boolean; message: string; bound?: boolean }
export async function verifyAndBindLicense(
  licenseCode: string,
  deviceId: string
): Promise<{ valid: boolean; message: string; alreadyBound?: boolean }> {
  const code = licenseCode.trim().toUpperCase();

  // 1. 检查授权码是否有效
  const validCodes = getValidLicenseCodes();
  if (!validCodes.includes(code)) {
    return { valid: false, message: "授权码无效，请检查后重试" };
  }

  // 2. 检查设备是否已绑定此授权码
  const alreadyBound = await isDeviceBound(code, deviceId);
  if (alreadyBound) {
    return { valid: true, message: "授权验证通过", alreadyBound: true };
  }

  // 3. 检查授权码已绑定的设备数量
  const boundDevices = await getBoundDevices(code);
  if (boundDevices.length >= MAX_DEVICES_PER_LICENSE) {
    return {
      valid: false,
      message: `该授权码已绑定 ${MAX_DEVICES_PER_LICENSE} 个设备，达到上限`,
    };
  }

  // 4. 绑定设备
  const success = await bindDevice(code, deviceId);
  if (!success) {
    return { valid: false, message: "设备绑定失败，请稍后重试" };
  }

  return { valid: true, message: "授权验证通过，设备已绑定", alreadyBound: false };
}

// 仅验证（不绑定），用于生成前检查
export async function verifyLicenseOnly(
  licenseCode: string,
  deviceId: string
): Promise<{ valid: boolean; message: string }> {
  const code = licenseCode.trim().toUpperCase();

  const validCodes = getValidLicenseCodes();
  if (!validCodes.includes(code)) {
    return { valid: false, message: "授权码无效" };
  }

  const alreadyBound = await isDeviceBound(code, deviceId);
  if (alreadyBound) {
    return { valid: true, message: "授权验证通过" };
  }

  // 未绑定但还有名额，也算有效（生成时会自动绑定）
  const boundDevices = await getBoundDevices(code);
  if (boundDevices.length >= MAX_DEVICES_PER_LICENSE) {
    return { valid: false, message: "授权码设备数已达上限" };
  }

  return { valid: true, message: "授权验证通过" };
}

// 获取授权码绑定状态（用于设置页显示）
export async function getLicenseStatus(
  licenseCode: string,
  deviceId: string
): Promise<{ valid: boolean; deviceCount: number; maxDevices: number; thisDeviceBound: boolean }> {
  const code = licenseCode.trim().toUpperCase();
  const validCodes = getValidLicenseCodes();

  if (!validCodes.includes(code)) {
    return { valid: false, deviceCount: 0, maxDevices: MAX_DEVICES_PER_LICENSE, thisDeviceBound: false };
  }

  const boundDevices = await getBoundDevices(code);
  const thisDeviceBound = boundDevices.includes(deviceId);

  return {
    valid: true,
    deviceCount: boundDevices.length,
    maxDevices: MAX_DEVICES_PER_LICENSE,
    thisDeviceBound,
  };
}
