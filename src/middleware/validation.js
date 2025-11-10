import { body } from 'express-validator';

export const validateUpdatePaymentStatus = [
  body('id').isInt().withMessage('id must be an integer'),
  body('status')
    .isIn(['pending', 'verified', 'reject'])
    .withMessage('status must be pending, verified, or reject'),
  body('remark')
    .if(body('status').equals('reject'))
    .notEmpty()
    .withMessage('remark is required if status is reject')
    .isString()
    .withMessage('remark must be a string')
    .isLength({ max: 255 })
    .withMessage('remark cannot exceed 255 characters')
];
