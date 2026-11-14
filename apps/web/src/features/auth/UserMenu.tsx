import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Button, buttonVariants, Dialog, DialogClose, DialogContent } from '../../shared/ui';
import { useCurrentUser, useLogout } from './api';

interface UserMenuProps {
  /** Changes made in this tab that are not saved yet: signing out asks first while there are any. */
  unsentChanges?: number;
  /** Runs once the user is signed out, before the home page opens. */
  onSignedOut?: () => void;
}

export function UserMenu({ unsentChanges = 0, onSignedOut }: UserMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useCurrentUser();
  const logout = useLogout();
  const [asking, setAsking] = useState(false);
  const signOutButton = useRef<HTMLButtonElement>(null);

  if (!me.data) {
    return (
      <Link to="/login" className={buttonVariants({ variant: 'ghost' })}>
        {t('auth.menu.signIn')}
      </Link>
    );
  }

  const signOut = () => {
    setAsking(false);
    logout.mutate(undefined, {
      onSettled: () => {
        onSignedOut?.();
        void navigate('/');
      },
    });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-ink" title={t('auth.menu.signedInAs', { name: me.data.name })}>
        {me.data.name}
      </span>
      <Button
        ref={signOutButton}
        variant="ghost"
        disabled={logout.isPending}
        onClick={() => (unsentChanges > 0 ? setAsking(true) : signOut())}
      >
        {t('auth.menu.signOut')}
      </Button>
      {/* Not a DialogTrigger (it only opens when something would be lost), so closing it puts
          focus back on the sign-out button by hand. */}
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent
          title={t('auth.menu.signOutTitle')}
          description={t('auth.menu.signOutBody', { count: unsentChanges })}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            signOutButton.current?.focus();
          }}
        >
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">{t('auth.menu.signOutStay')}</Button>
            </DialogClose>
            <Button variant="danger" onClick={signOut}>
              {t('auth.menu.signOutAnyway')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
