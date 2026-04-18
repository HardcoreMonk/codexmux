export const capturePristineEnv = (): void => {
  if (process.env.__PMUX_PRISTINE_ENV) return;
  process.env.__PMUX_PRISTINE_ENV = JSON.stringify(process.env);
};
