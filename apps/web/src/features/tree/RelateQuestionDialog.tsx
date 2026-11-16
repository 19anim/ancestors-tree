import { useTranslation } from 'react-i18next';
import { Button, Dialog, DialogContent } from '../../shared/ui';
import type { ChangeAnswers } from './changes';
import type { QuestionText } from './relateText';

interface RelateQuestionDialogProps extends QuestionText {
  onAnswer: (answers: ChangeAnswers) => void;
  onCancel: () => void;
}

/**
 * A follow-up question instead of a dead end (spec §7.6). Focus is the runner's to place when it
 * closes (the card, or what opened it), so Radix's own return is turned off.
 */
export function RelateQuestionDialog({
  title,
  description,
  answers,
  onAnswer,
  onCancel,
}: RelateQuestionDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent
        title={title}
        description={description}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex flex-col gap-2">
          {answers.map((answer) => (
            <Button
              // Two answers can read the same (two partners with one name); their values differ.
              key={JSON.stringify(answer.answers)}
              variant="secondary"
              className="justify-start"
              onClick={() => onAnswer(answer.answers)}
            >
              {answer.label}
            </Button>
          ))}
          <Button variant="ghost" className="justify-start" onClick={onCancel}>
            {t('tree.relate.ask.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
