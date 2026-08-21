import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { FilePlus2, ShieldAlert } from 'lucide-react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_SCAFFOLD_ARTIFACT_IDS,
  listScaffoldTemplates,
} from '@/lib/governance/scaffold-template-catalog';
import {
  scaffoldArtifactIdSchema,
  scaffoldTemplateInputSchema,
  type TScaffoldArtifactId,
  type TScaffoldTemplateInput,
} from '@/lib/governance/scaffold-contracts';

const scaffoldFormSchema = z.object({
  title: scaffoldTemplateInputSchema.shape.title,
  summary: scaffoldTemplateInputSchema.shape.summary,
  uiProject: z.boolean(),
  artifacts: z.array(scaffoldArtifactIdSchema).min(1).max(6),
}).strict();

type TScaffoldForm = z.infer<typeof scaffoldFormSchema>;

interface IGovernanceScaffoldPanelProps {
  projectTitle: string;
  writeState: 'disabled' | 'ready' | 'recovering' | 'degraded';
  busy: boolean;
  error: string | null;
  onPreview: (input: {
    artifacts: TScaffoldArtifactId[];
    input: TScaffoldTemplateInput;
  }) => void | Promise<void>;
}

const GovernanceScaffoldPanel = ({
  projectTitle,
  writeState,
  busy,
  error,
  onPreview,
}: IGovernanceScaffoldPanelProps) => {
  const t = useTranslations('governance');
  const templates = listScaffoldTemplates();
  const { control, getValues, register, handleSubmit, setValue, formState: { errors } } = useForm<TScaffoldForm>({
    resolver: zodResolver(scaffoldFormSchema),
    defaultValues: {
      title: projectTitle,
      summary: '',
      uiProject: false,
      artifacts: [...DEFAULT_SCAFFOLD_ARTIFACT_IDS],
    },
  });
  const uiProject = useWatch({ control, name: 'uiProject' });
  const ready = writeState === 'ready';

  const submit = (value: TScaffoldForm) => onPreview({
    artifacts: value.artifacts,
    input: { title: value.title, summary: value.summary, uiProject: value.uiProject },
  });

  return (
    <section className="rounded-md border p-3 xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <FilePlus2 className="h-3.5 w-3.5" />
            {t('scaffold.title')}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{t('scaffold.description')}</div>
        </div>
        <span className="rounded bg-muted px-2 py-1 text-[10px] font-medium">
          {t(`writeState.${writeState}`)}
        </span>
      </div>

      {!ready && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-ui-yellow/20 bg-ui-yellow/5 p-3 text-xs">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-ui-yellow" />
          <span>{t(`scaffold.writeStateDescription.${writeState}`)}</span>
        </div>
      )}

      <form className="mt-3 grid gap-3 lg:grid-cols-2" onSubmit={handleSubmit(submit)}>
        <div className="space-y-1.5">
          <Label htmlFor="scaffold-title">{t('scaffold.projectTitle')}</Label>
          <Input id="scaffold-title" className="min-h-11" disabled={!ready || busy} {...register('title')} />
          {errors.title && <div className="text-[10px] text-destructive">{errors.title.message}</div>}
        </div>
        <div className="flex min-h-11 items-center justify-between rounded-md border px-3 py-2">
          <div>
            <Label htmlFor="scaffold-ui-project">{t('scaffold.uiProject')}</Label>
            <div className="text-[10px] text-muted-foreground">{t('scaffold.uiProjectDescription')}</div>
          </div>
          <Controller
            name="uiProject"
            control={control}
            render={({ field }) => (
              <Switch
                id="scaffold-ui-project"
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                  if (!checked) {
                    setValue('artifacts', getValues('artifacts').filter((id) => id !== 'design'));
                  }
                }}
                disabled={!ready || busy}
              />
            )}
          />
        </div>
        <div className="space-y-1.5 lg:col-span-2">
          <Label htmlFor="scaffold-summary">{t('scaffold.summary')}</Label>
          <Textarea
            id="scaffold-summary"
            rows={3}
            disabled={!ready || busy}
            placeholder={t('scaffold.summaryPlaceholder')}
            {...register('summary')}
          />
          {errors.summary && <div className="text-[10px] text-destructive">{errors.summary.message}</div>}
        </div>
        <Controller
          name="artifacts"
          control={control}
          render={({ field }) => (
            <fieldset className="grid gap-2 lg:col-span-2 sm:grid-cols-2 xl:grid-cols-3">
              <legend className="mb-1 text-xs font-medium">{t('scaffold.artifacts')}</legend>
              {templates.map((template) => {
                const disabled = !ready || busy || (template.uiOnly && !uiProject);
                return (
                  <label
                    key={template.id}
                    className="flex min-h-11 items-center gap-3 rounded-md border px-3 py-2 text-xs has-disabled:opacity-60"
                  >
                    <Checkbox
                      checked={field.value.includes(template.id)}
                      disabled={disabled}
                      onCheckedChange={(checked) => field.onChange(checked
                        ? [...field.value, template.id]
                        : field.value.filter((id) => id !== template.id))}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-mono font-medium">{template.path}</span>
                      <span className="text-[10px] text-muted-foreground">v{template.version}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}
        />
        {errors.artifacts && <div className="text-[10px] text-destructive lg:col-span-2">{errors.artifacts.message}</div>}
        {error && <div className="text-xs text-destructive lg:col-span-2">{error}</div>}
        <div className="flex justify-end lg:col-span-2">
          <Button type="submit" className="min-h-11" disabled={!ready || busy}>
            {busy ? t('scaffold.processing') : t('scaffold.preview')}
          </Button>
        </div>
      </form>
    </section>
  );
};

export default GovernanceScaffoldPanel;
export type { IGovernanceScaffoldPanelProps };
