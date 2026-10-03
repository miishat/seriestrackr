// One shape rule for user-supplied provider keys, used by the browser and by the local service.
export const apiKeyPattern = /^[\x21-\x7e]{8,300}$/;
export const isApiKey = (value: unknown): value is string => typeof value === 'string' && apiKeyPattern.test(value);
