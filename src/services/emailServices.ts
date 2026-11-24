import accountVerificationEmailTemplate, {
  AccountVerificationEmailTemplate,
} from '../util/email/emailTemplates/accountVerificationTemplate';
import { emailTransporter } from '../util/email/emailTransporter';

type SendEmailService = {
  to: string;
  subject: string;
  html: string;
};

async function sendEmailService({ to, subject, html }: SendEmailService): Promise<void> {
  try {
    await emailTransporter.sendMail({
      from: `Aequitas <${process.env.TRANSPORTER_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err: unknown) {
    console.log(err);
  }
}

export async function sendAccountVerificationEmailService(
  payload: { to: string } & AccountVerificationEmailTemplate
): Promise<void> {
  const { to, ...rest } = payload;

  await sendEmailService({
    to,
    subject: 'Aequitas - Account Verification',
    html: accountVerificationEmailTemplate({ ...rest }),
  });
}
