// Which player the popup controls: automatic (the active one), a chosen player, or every player.
// A select-only combobox (WAI-ARIA APG): closed it shows a short name, always whole, and beside it
// what that player is, shortened when there is no room (read whole as its description); open, the
// list names every player in full. A native select cannot do this: it shows the same text closed
// and open. The popup has no height for a line more (600 px, the browser's limit).

import type { EngineState } from '../../core/messages/Protocol.ts';
import { h, setAttr, setHidden, setText } from '../dom.ts';
import type { Localization } from '../i18n.ts';
import { playerDetails, playerLabel, playerName, playersInOrder } from '../players.ts';
import type { PlayerChoice } from './popupActions.ts';

const AUTO = 'auto';
const ALL = 'all';

interface Entry {
  readonly value: string;
  readonly name: string;
  readonly details: string;
}

function choiceOf(value: string): PlayerChoice {
  if (value === AUTO) return { kind: 'auto' };
  if (value === ALL) return { kind: 'all' };
  return { kind: 'player', id: Number(value) };
}

export function playerPicker(
  document: Document,
  l10n: Localization,
  choose: (choice: PlayerChoice) => void,
) {
  const { t } = l10n;
  const shown = h(document, 'span', { className: 'player-name', attrs: { id: 'player-name' } });
  const detail = h(document, 'span', {
    className: 'player-detail',
    attrs: { id: 'player-detail' },
  });
  const combo = h(
    document,
    'button',
    {
      className: 'player',
      attrs: {
        type: 'button',
        id: 'player',
        role: 'combobox',
        'aria-haspopup': 'listbox',
        'aria-expanded': 'false',
        'aria-controls': 'player-list',
        'aria-labelledby': 'player-label player-name',
        'aria-describedby': 'player-detail',
        popovertarget: 'player-list',
      },
    },
    [shown, detail],
  );
  const list = h(document, 'div', {
    className: 'player-list',
    attrs: {
      id: 'player-list',
      role: 'listbox',
      popover: 'auto',
      'aria-labelledby': 'player-label',
    },
  });
  const element = h(document, 'div', { className: 'target' }, [
    h(document, 'span', {
      className: 'visually-hidden',
      text: t('controlling'),
      attrs: { id: 'player-label' },
    }),
    combo,
    list,
  ]);

  let entries: Entry[] = [];
  let entriesKey = '';
  let selected = AUTO;
  /** The option the keyboard is on while the list is open. */
  let active = 0;

  const optionId = (value: string) => `player-option-${value}`;
  const isOpen = () => list.matches(':popover-open');

  const highlight = (): void => {
    active = Math.min(Math.max(active, 0), entries.length - 1);
    for (const [index, option] of Array.from(list.children).entries()) {
      option.classList.toggle('active', index === active);
    }
    const entry = entries[active];
    if (isOpen() && entry !== undefined)
      setAttr(combo, 'aria-activedescendant', optionId(entry.value));
  };
  const pick = (value: string): void => {
    if (isOpen()) list.hidePopover();
    if (value !== selected) choose(choiceOf(value));
  };

  /** The list just opened or closed: the keyboard starts on the chosen option. */
  const toggled = (): void => {
    const open = isOpen();
    setAttr(combo, 'aria-expanded', String(open));
    if (open) {
      active = entries.findIndex((entry) => entry.value === selected);
      highlight();
    } else combo.removeAttribute('aria-activedescendant');
  };
  // The browser tells of the change a task later; opened from the keyboard, it is shown at once.
  list.addEventListener('toggle', toggled);
  combo.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key;
    const open = isOpen();
    const moves: Readonly<Record<string, (index: number) => number>> = {
      ArrowDown: (index) => index + 1,
      ArrowUp: (index) => index - 1,
      Home: () => 0,
      End: () => entries.length - 1,
    };
    const move = moves[key];
    if (move !== undefined) {
      event.preventDefault();
      if (!open) {
        list.showPopover();
        toggled();
      } else {
        active = move(active);
        highlight();
      }
      return;
    }
    if (!open) return;
    const entry = entries[active];
    if (key === 'Escape') {
      // Closed without a change, whatever the browser does with Escape on its own.
      event.preventDefault();
      list.hidePopover();
    } else if (key === 'Enter' || key === ' ') {
      // Taken here, so the button does not also toggle the list.
      event.preventDefault();
      if (entry !== undefined) pick(entry.value);
    } else if (key === 'Tab' && entry !== undefined) pick(entry.value);
  });

  const renderOptions = (): void => {
    list.replaceChildren(
      ...entries.map((entry) =>
        h(
          document,
          'div',
          {
            className: 'player-option',
            attrs: { role: 'option', id: optionId(entry.value), 'aria-selected': 'false' },
            on: { click: () => pick(entry.value) },
          },
          [
            h(document, 'span', { className: 'player-option-name', text: entry.name }),
            entry.details === ''
              ? null
              : h(document, 'span', { className: 'player-option-details', text: entry.details }),
          ],
        ),
      ),
    );
  };

  return {
    element,
    render(state: EngineState): void {
      const players = playersInOrder(state.players);
      const activeIndex = players.findIndex((player) => player.id === state.activePlayerId);
      const activePlayer = players[activeIndex];
      const next: Entry[] = [
        {
          value: AUTO,
          name: t('playerAuto'),
          details: activePlayer === undefined ? '' : playerLabel(t, activePlayer, activeIndex + 1),
        },
        ...players.map((player, index) => ({
          value: String(player.id),
          name: playerName(t, player, index + 1),
          details: playerDetails(t, player),
        })),
        { value: ALL, name: t('playerAll'), details: '' },
      ];
      // Rebuilt only when what it lists changes, so an open list is not disturbed.
      const key = JSON.stringify(next);
      if (key !== entriesKey) {
        entriesKey = key;
        entries = next;
        renderOptions();
        if (isOpen()) highlight();
      }
      selected =
        state.target === 'all'
          ? ALL
          : state.pinned && state.activePlayerId !== null
            ? String(state.activePlayerId)
            : AUTO;
      for (const option of list.children) {
        setAttr(option, 'aria-selected', String(option.id === optionId(selected)));
      }
      const current = entries.find((entry) => entry.value === selected);
      setText(shown, current?.name ?? '');
      setText(detail, current?.details ?? '');
      setHidden(detail, (current?.details ?? '') === '');
    },
  };
}
