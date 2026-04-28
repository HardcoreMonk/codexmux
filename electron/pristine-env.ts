export const capturePristineEnv = (): void => {
  if (process.env.__CMUX_PRISTINE_ENV) return;
  process.env.__CMUX_PRISTINE_ENV = JSON.stringify(process.env);
};
