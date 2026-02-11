// TutorialLauncher: header button to open/close the tutorial panel.

import type { Accessor, Component } from 'solid-js';

interface TutorialLauncherProps {
  isOpen: Accessor<boolean>;
  onToggle: () => void;
}

export const TutorialLauncher: Component<TutorialLauncherProps> = (props) => {
  return (
    <button
      class="btn-secondary btn-small"
      data-tutorial="tutorial-launcher"
      onClick={props.onToggle}
    >
      {props.isOpen() ? 'Close Tutorial' : 'Tutorial'}
    </button>
  );
};
