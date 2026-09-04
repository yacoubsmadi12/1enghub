import nodemailer from "nodemailer";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const encryptionKey = () => createHash("sha256").update(process.env.JWT_SECRET || "enghub-smtp-local-key").digest();

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
};

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(value: string) {
  const [ivText, tagText, encryptedText] = value.split(".");
  if (!ivText || !tagText || !encryptedText) throw new Error("Invalid encrypted SMTP secret");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

export async function sendPasswordResetEmail(config: SmtpConfig, recipient: string, resetUrl: string, recipientName?: string | null) {
  const transporter = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, auth: { user: config.username, pass: config.password } });
  await transporter.sendMail({
    from: config.fromEmail,
    to: recipient,
    subject: "ENGHUB password reset",
    text: `Hello ${recipientName || "there"},\n\nUse this link to reset your ENGHUB password: ${resetUrl}\n\nThis link expires in 30 minutes and can be used once.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>ENGHUB password reset</h2><p>Hello ${recipientName || "there"},</p><p>Use the secure link below to choose a new password:</p><p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#67e8f9;color:#061017;text-decoration:none;border-radius:8px">Reset password</a></p><p>This link expires in 30 minutes and can be used once.</p></div>`,
  });
}
