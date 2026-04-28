const cached = process.env.__CMUX_PRISTINE_ENV;

export const PRISTINE_ENV: NodeJS.ProcessEnv = Object.freeze(
  cached ? (JSON.parse(cached) as NodeJS.ProcessEnv) : { ...process.env },
);

if (!cached) {
  process.env.__CMUX_PRISTINE_ENV = JSON.stringify(PRISTINE_ENV);
}
