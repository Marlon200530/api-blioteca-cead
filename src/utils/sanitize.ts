import xss from 'xss';

export const sanitizeText = (value: string) =>
  xss(value, {
    whiteList: {},
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style']
  }).trim();

export const sanitizeOptionalText = (value?: string | null) =>
  value ? sanitizeText(value) : value;
