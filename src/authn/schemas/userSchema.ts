import * as yup from 'yup';

const validPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])[A-Za-z\d\W_]{12,}$/;

export const creationSchema = yup.object({
    name: yup.string()
        .typeError('Full Name must be a string')
        .required('Full Name is required')
        .min(2, 'Full Name must be at least 2 characters'),
    email: yup.string()
        .typeError('Email Name must be a string')
        .required('Email is required')
        .email('Email must be a valid email address'),
    password: yup.string()
        .typeError('Password must be a string')
        .required('Password is required')
        .matches(validPasswordRegex, 'Password must contain at least 12 characters, one uppercase, one lowercase, one number and one special character'),
    passwordConfirm: yup.string()
        .typeError('Password confirmation must be a string')
        .required('Password confirmation is required')
        .oneOf([yup.ref('password')], 'Passwords must match')
});

export const passwordResetSchema = yup.object({
  password: yup.string()
      .typeError('Password must be a string')
      .required('Password is required')
      .matches(validPasswordRegex, 'Password must contain at least 12 characters, one uppercase, one lowercase, one number and one special character'),
});

export const emailUpdateSchema = yup.object({
  email: yup
    .string()
    .typeError('Email must be a string')
    .required('Email is required')
    .email('Email must be a valid email address'),
  password: yup.string().optional(),
});

export const loginSchema = yup
  .object({
    email: yup.string()
      .typeError('Email Name must be a string')
      .required('Email is required')
      .email('Email must be a valid email address'),
    password: yup.string()
        .typeError('Password must be a string')
        .required('Password is required'),
    mfaToken: yup
      .string()
      .typeError('MFA token must be a string')
      .matches(/^\d{6}$/, 'MFA token must be 6 digits'),
    backupCode: yup
      .string()
      .typeError('Backup code must be a string')
      .matches(/^[A-F0-9]{8}$/, 'Backup code must be 8 hexadecimal characters'),
  })
  .test('mfa-validation', 'Either MFA token or backup code must be provided when MFA is required', function (value) {
    const { mfaToken, backupCode } = value;
    if (mfaToken && backupCode) {
      return this.createError({
        message: 'Cannot provide both MFA token and backup code',
      });
    }
    return true;
  });
