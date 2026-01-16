const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const readJsonFile = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
};

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
};

const parseBool = (value, defaultValue) => {
  if (value == null || value === '') return defaultValue;
  return String(value).toLowerCase() === 'true' || String(value) === '1';
};

const buildEmailText = (urls) => {
  const lines = [];
  lines.push(`Udemy enroll links: ${urls.length}`);
  lines.push('');
  urls.forEach((u) => lines.push(u));
  lines.push('');
  return lines.join('\n');
};

(async () => {
  const jsonPath = path.join(__dirname, 'enrollLinks.udemy.json');
  const urls = readJsonFile(jsonPath);
  if (!Array.isArray(urls)) {
    throw new Error('enrollLinks.udemy.json must be a JSON array of strings');
  }

  const toEmail = process.argv[2] || process.env.TO_EMAIL;
  if (!toEmail) {
    throw new Error('Provide recipient email as argv[2] or TO_EMAIL env var');
  }

  const host = requireEnv('SMTP_HOST');
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = parseBool(process.env.SMTP_SECURE, port === 465);
  const user = requireEnv('SMTP_USER');
  const pass = requireEnv('SMTP_PASS');
  const fromEmail = process.env.FROM_EMAIL || user;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  const uniqueSortedUrls = [...new Set(urls.map((u) => String(u).trim()).filter(Boolean))].sort();
  const subject = process.env.EMAIL_SUBJECT || `Udemy enroll links (${uniqueSortedUrls.length})`;
  const text = buildEmailText(uniqueSortedUrls);

  const info = await transporter.sendMail({
    from: fromEmail,
    to: toEmail,
    subject,
    text,
  });

  process.stdout.write(`Sent email: ${info.messageId}\n`);
})().catch((err) => {
  process.stderr.write(`${err.stack || err.message || String(err)}\n`);
  process.exit(1);
});

