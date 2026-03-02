/**
 * Lightweight input validators.
 * Returns 422 with a descriptive error if validation fails.
 * Does NOT require extra npm packages.
 */

function validate(rules) {
  return (req, res, next) => {
    const errors = [];
    for (const [field, checks] of Object.entries(rules)) {
      const value = req.body[field];
      for (const check of checks) {
        const err = check(value, field);
        if (err) { errors.push(err); break; }
      }
    }
    if (errors.length) return res.status(422).json({ errors });
    next();
  };
}

// ── Reusable rule factories ────────────────────────────────────────────────

const required = (field) => (v) =>
  v === undefined || v === null || String(v).trim() === ''
    ? `${field} is required`
    : null;

const maxLen = (max) => (v, field) =>
  v && String(v).length > max ? `${field} must be at most ${max} characters` : null;

const minLen = (min) => (v, field) =>
  v && String(v).length < min ? `${field} must be at least ${min} characters` : null;

const isEmail = () => (v, field) =>
  v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)) ? `${field} must be a valid email` : null;

const isPhone = () => (v, field) =>
  v && !/^[\d+\-\s()]{5,25}$/.test(String(v).trim()) ? `${field} must be a valid phone number` : null;

const isNonNegNumber = () => (v, field) =>
  v !== undefined && (isNaN(Number(v)) || Number(v) < 0)
    ? `${field} must be a non-negative number`
    : null;

const passwordStrength = () => (v, field) => {
  if (!v) return null;
  if (String(v).length < 8) return `${field} must be at least 8 characters`;
  if (!/[0-9!@#$%^&*]/.test(String(v))) return `${field} must contain at least one digit or special character`;
  return null;
};

// ── Prebuilt validators for each route ────────────────────────────────────

const validateUser = validate({
  username: [required('username'), minLen(3), maxLen(50)],
  password: [required('password'), passwordStrength()],
  name:     [maxLen(255)],
});

const validateUserPassword = validate({
  password: [required('password'), passwordStrength()],
});

const validateClient = validate({
  name:  [required('name'), maxLen(255)],
  phone: [required('phone'), isPhone()],
  email: [isEmail(), maxLen(255)],
  note:  [maxLen(2000)],
});

const validateProduct = validate({
  name:  [required('name'), maxLen(255)],
  price: [required('price'), isNonNegNumber()],
  description: [maxLen(2000)],
});

const validateNote = validate({
  text: [required('text'), maxLen(5000)],
});

module.exports = {
  validate,
  required, maxLen, minLen, isEmail, isPhone, isNonNegNumber, passwordStrength,
  validateUser,
  validateUserPassword,
  validateClient,
  validateProduct,
  validateNote,
};
