export type AuthAction = 'signin' | 'signup' | 'forgot' | 'password';

type AuthErrorLike = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
};

function details(error: unknown): { code: string; message: string; status: number | null } {
  if (typeof error === 'string') {
    return { code: '', message: error, status: null };
  }

  if (!error || typeof error !== 'object') {
    return { code: '', message: '', status: null };
  }

  const candidate = error as AuthErrorLike;
  return {
    code: typeof candidate.code === 'string' ? candidate.code.toLowerCase() : '',
    message: typeof candidate.message === 'string' ? candidate.message : '',
    status: typeof candidate.status === 'number' ? candidate.status : null,
  };
}

/** Turn Supabase Auth failures into guidance a user can act on. */
export function authErrorMessage(error: unknown, action: AuthAction): string {
  const { code, message, status } = details(error);
  const normalizedMessage = message.toLowerCase();
  const mentions = (...phrases: string[]) => phrases.some((phrase) => normalizedMessage.includes(phrase));
  const emailLimitReached =
    code === 'over_email_send_rate_limit'
    || normalizedMessage.includes('email rate limit');

  if (emailLimitReached) {
    if (action === 'signup') {
      return 'The confirmation-email limit is temporarily full. Please wait and try again. If you already received a confirmation email, confirm it and use Sign in.';
    }
    return 'Too many account emails were requested. Please wait before trying again.';
  }

  if (status === 429 || code.includes('rate_limit') || normalizedMessage.includes('rate limit')) {
    return 'Too many attempts were made in a short time. Please wait a few minutes and try again.';
  }

  if (code === 'email_address_not_authorized' || normalizedMessage.includes('email address not authorized')) {
    return 'YouDO cannot send an account email to this address right now. Please try again later.';
  }

  if (code === 'email_not_confirmed' || mentions('email not confirmed')) {
    return 'Confirm your email before signing in. Check your inbox and Spam for the YouDO verification email.';
  }

  if (code === 'invalid_credentials' || mentions('invalid login credentials')) {
    return 'The email or password is incorrect.';
  }

  if (code === 'email_address_invalid' || mentions('invalid email')) {
    return 'Enter a valid email address.';
  }

  if (code === 'weak_password') {
    return 'Use a stronger password with at least 10 characters.';
  }

  if (code === 'same_password') {
    return 'Choose a password different from your current password.';
  }

  if (
    action === 'password'
    && (
      code === 'session_not_found'
      || code === 'session_expired'
      || code === 'otp_expired'
      || mentions('reset link is invalid', 'reset link has expired', 'invalid or has expired')
    )
  ) {
    return 'This reset link is invalid or has expired. Request a new one.';
  }

  if (code === 'signup_disabled' || code === 'email_provider_disabled') {
    return 'New account registration is temporarily unavailable. Please try again later.';
  }

  if (code === 'email_exists' || code === 'user_already_exists') {
    return 'The account could not be created. Try signing in or use Forgot password.';
  }

  if (code === 'captcha_failed') {
    return 'The verification check failed. Please try again.';
  }

  if (status === 0 || mentions('failed to fetch', 'network request failed', 'networkerror')) {
    return 'YouDO could not reach the account service. Check your connection and try again.';
  }

  if ((status != null && status >= 500) || code === 'unexpected_failure' || code === 'request_timeout') {
    return 'The account service is temporarily unavailable. Please try again shortly.';
  }

  if (action === 'password') return 'Password could not be changed.';
  if (action === 'forgot') return 'The reset email could not be sent.';
  if (action === 'signup') return 'The account could not be created. Please try again.';
  return 'Sign-in failed. Please try again.';
}
