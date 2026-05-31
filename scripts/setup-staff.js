#!/usr/bin/env node
/**
 * Secure staff bootstrap (run locally only)
 *
 * - Passwords are typed in the terminal (masked), never stored in files
 * - Service account JSON stays OUTSIDE the repo (see .env.example)
 * - Does NOT write to git
 *
 * Setup:
 *   1. Firebase Console → Project settings → Service accounts → Generate new private key
 *   2. Save JSON outside this project (e.g. ~/secrets/homieboy-sa.json)
 *   3. npm install
 *   4. export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json"
 *   5. npm run setup:staff
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PROJECT_ID = 'homeboy-86a70';

const ROLES = [
    { key: 'admin',   label: 'Admin (จัดการร้าน)',   defaultEmail: 'admin@homieboy.com' },
    { key: 'kitchen', label: 'Kitchen (จอครัว)',     defaultEmail: 'kitchen@homieboy.com' },
    { key: 'rider',   label: 'Rider (ไรเดอร์)',      defaultEmail: 'rider@homieboy.com' },
];

function loadEnvFile() {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
    }
}

function ask(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

function askPassword(prompt) {
    return new Promise((resolve) => {
        process.stdout.write(prompt);
        const stdin = process.stdin;
        const wasRaw = stdin.isRaw;
        if (stdin.isTTY) stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');

        let password = '';

        const onData = (char) => {
            char = char.toString();
            if (char === '\n' || char === '\r' || char === '\u0004') {
                if (stdin.isTTY) stdin.setRawMode(wasRaw || false);
                stdin.pause();
                stdin.removeListener('data', onData);
                process.stdout.write('\n');
                resolve(password);
            } else if (char === '\u0003') {
                process.stdout.write('\n');
                process.exit(130);
            } else if (char === '\u007f' || char === '\b') {
                if (password.length > 0) password = password.slice(0, -1);
            } else {
                password += char;
                process.stdout.write('*');
            }
        };

        stdin.on('data', onData);
    });
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
    if (password.length < 8) return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัว';
    return null;
}

async function resolveCredentialsPath() {
    loadEnvFile();
    let credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (!credPath) {
        console.log('\nไม่พบ GOOGLE_APPLICATION_CREDENTIALS');
        console.log('ดาวน์โหลด Service Account JSON จาก Firebase Console');
        console.log('(Project settings → Service accounts → Generate new private key)\n');
        credPath = await ask('วาง path ไฟล์ JSON (นอก repo): ');
    }

    credPath = credPath.replace(/^~/, process.env.HOME || '');
    if (!fs.existsSync(credPath)) {
        throw new Error(`ไม่พบไฟล์: ${credPath}`);
    }

    const resolved = path.resolve(credPath);
    const repoRoot = path.resolve(__dirname, '..');
    if (resolved.startsWith(repoRoot + path.sep) || resolved === repoRoot) {
        throw new Error(
            'อย่าเก็บ Service Account JSON ในโฟลเดอร์โปรเจกตนี้\n' +
            'ย้ายไฟล์ไปที่อื่น (เช่น ~/secrets/) แล้วรันใหม่'
        );
    }

    return resolved;
}

async function upsertStaffUser(auth, db, { email, password, role, label }) {
    console.log(`\n── ${label} ──`);

    const skip = await ask(`สร้าง/อัปเดต ${role}? [Y/n]: `);
    if (skip.toLowerCase() === 'n') {
        console.log('  ข้าม');
        return null;
    }

    let finalEmail = await ask(`อีเมล [${email}]: `);
    if (!finalEmail) finalEmail = email;
    if (!validateEmail(finalEmail)) {
        throw new Error(`อีเมลไม่ถูกต้อง: ${finalEmail}`);
    }

    let uid;
    let created = false;

    try {
        const existing = await auth.getUserByEmail(finalEmail);
        uid = existing.uid;
        console.log(`  พบบัญชี Auth อยู่แล้ว (uid: ${uid})`);

        const changePw = await ask('  เปลี่ยนรหัสผ่าน? [y/N]: ');
        if (changePw.toLowerCase() === 'y') {
            const pw = await askPassword('  รหัสผ่านใหม่ (อย่างน้อย 8 ตัว): ');
            const pwErr = validatePassword(pw);
            if (pwErr) throw new Error(pwErr);
            const confirm = await askPassword('  ยืนยันรหัสผ่าน: ');
            if (pw !== confirm) throw new Error('รหัสผ่านไม่ตรงกัน');
            await auth.updateUser(uid, { password: pw });
            console.log('  อัปเดตรหัสผ่านแล้ว');
        }
    } catch (err) {
        if (err.code !== 'auth/user-not-found') throw err;

        const pw = await askPassword('  รหัสผ่านใหม่ (อย่างน้อย 8 ตัว): ');
        const pwErr = validatePassword(pw);
        if (pwErr) throw new Error(pwErr);
        const confirm = await askPassword('  ยืนยันรหัสผ่าน: ');
        if (pw !== confirm) throw new Error('รหัสผ่านไม่ตรงกัน');

        const user = await auth.createUser({
            email: finalEmail,
            password: pw,
            emailVerified: true,
        });
        uid = user.uid;
        created = true;
        console.log(`  สร้างบัญชี Auth แล้ว (uid: ${uid})`);
    }

    await db.collection('staff').doc(uid).set({
        role,
        email: finalEmail,
        updatedAt: new Date().toISOString(),
    }, { merge: true });

    console.log(`  บันทึก staff/${uid} → role: ${role}`);
    return { uid, email: finalEmail, role, created };
}

async function main() {
    console.log('HomieBoy — Secure Staff Setup');
    console.log('รหัสผ่านจะไม่ถูกบันทึกลงไฟล์หรือ git\n');

    const credPath = await resolveCredentialsPath();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;

    const admin = require('firebase-admin');

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.applicationDefault(),
            projectId: PROJECT_ID,
        });
    }

    const auth = admin.auth();
    const db = admin.firestore();

    const results = [];
    for (const roleDef of ROLES) {
        const result = await upsertStaffUser(auth, db, roleDef);
        if (result) results.push(result);
    }

    console.log('\n════════════════════════════════════');
    console.log('เสร็จแล้ว!');
    if (results.length === 0) {
        console.log('ไม่ได้สร้าง/อัปเดต staff ใด ๆ');
    } else {
        console.log('\nบัญชีที่ตั้งค่า:');
        for (const r of results) {
            console.log(`  • ${r.role.padEnd(7)} ${r.email}`);
        }
        console.log('\nขั้นต่อไป:');
        console.log('  1. npm run deploy:rules   (deploy Firestore security rules)');
        console.log('  2. ลอง login ที่ login.html');
        console.log('  3. ลบ collection "users" เก่าใน Firestore (ถ้ายังมี password plain text)');
    }
    console.log('════════════════════════════════════\n');
}

main().catch((err) => {
    console.error('\n❌ ผิดพลาด:', err.message || err);
    process.exit(1);
});
