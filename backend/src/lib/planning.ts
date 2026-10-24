import { z } from 'zod';

const monday = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 1;
}, 'Ange måndagens datum');
export const planningDocumentSchema = z.object({
  weeks: z.array(z.object({
    startDate: monday,
    note: z.string().max(5000),
    people: z.array(z.object({
      name: z.string().trim().min(1).max(100),
      days: z.array(z.string().max(500)).length(5),
      assignments: z.array(z.array(z.string().min(1).max(200).refine(name => Boolean(name.trim()), 'Jobbnamn får inte vara tomma'))
        .max(200).refine(names => new Set(names).size === names.length, 'Samma jobb finns redan på dagen')).length(5).optional(),
    }).strict()).max(100),
  }).strict()).max(104),
  jobs: z.array(z.object({ name: z.string().trim().min(1).max(200), details: z.string().max(5000), deadline: z.string().max(1000) }).strict()).max(200),
  issues: z.string().max(20000),
}).strict().refine(doc => new Set(doc.weeks.map(week => week.startDate)).size === doc.weeks.length, 'Veckan finns redan');
export const savePlanningSchema = z.object({ expectedRevision: z.number().int().min(0), document: planningDocumentSchema }).strict();
export const planningCommentSchema = z.object({ content: z.string().trim().min(1).max(5000), requestKey: z.string().uuid() }).strict();
