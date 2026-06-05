import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import { execFileSync } from 'child_process';

function hashParts(parts: Array<string | number | undefined | null>): string {
  const clean = parts.map((part) => String(part || '').trim()).filter(Boolean);
  const source = clean.length > 0 ? clean : [String(getMacNode()), os.hostname(), os.platform()];
  return crypto.createHash('sha256').update(source.join('|'), 'utf8').digest('hex');
}

function runCommand(command: string, args: string[], timeout = 2000): string {
  try {
    return execFileSync(command, args, {
      timeout,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function getMacNode(): string {
  const network = os.networkInterfaces();
  for (const entries of Object.values(network)) {
    for (const entry of entries || []) {
      if (!entry.internal && entry.mac && entry.mac !== '00:00:00:00:00:00') {
        return entry.mac;
      }
    }
  }
  return '';
}

function readFirstExisting(paths: string[]): string {
  for (const filePath of paths) {
    try {
      const value = fs.readFileSync(filePath, 'utf8').trim();
      if (value) return value;
    } catch {
      // ignore
    }
  }
  return '';
}

function windowsMachineCode(): string {
  const machineGuid = runCommand('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    "(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography').MachineGuid",
  ], 3000);
  const uuid = runCommand('powershell.exe', ['-NoProfile', '-Command', '(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID'], 3000).split(/\r?\n/)[0];
  const bios = runCommand('powershell.exe', ['-NoProfile', '-Command', '(Get-CimInstance -ClassName Win32_BIOS).SerialNumber'], 3000).split(/\r?\n/)[0];
  const board = runCommand('powershell.exe', ['-NoProfile', '-Command', '(Get-CimInstance -ClassName Win32_BaseBoard).SerialNumber'], 3000).split(/\r?\n/)[0];
  return hashParts([machineGuid, uuid, bios, board, getMacNode(), os.hostname()]);
}

function linuxMachineCode(): string {
  return hashParts([
    readFirstExisting([
      '/etc/machine-id',
      '/var/lib/dbus/machine-id',
      '/sys/class/dmi/id/product_uuid',
      '/sys/class/dmi/id/board_serial',
    ]),
    getMacNode(),
    os.hostname(),
    os.arch(),
  ]);
}

function macMachineCode(): string {
  const ioreg = runCommand('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], 2000);
  const uuid = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(ioreg)?.[1] || '';
  const serial = /"IOPlatformSerialNumber"\s*=\s*"([^"]+)"/.exec(ioreg)?.[1] || '';
  return hashParts([uuid, serial, getMacNode(), os.hostname()]);
}

export function getMachineCode(): string {
  if (process.platform === 'win32') return windowsMachineCode();
  if (process.platform === 'linux') return linuxMachineCode();
  if (process.platform === 'darwin') return macMachineCode();
  return hashParts([getMacNode(), os.hostname(), os.arch(), os.platform()]);
}
