import type { ParentComponent, JSX } from 'solid-js';

type PanelVariant = 'controls' | 'data' | 'interactive' | 'default' | 'flush';

interface DashboardPanelProps {
  id: string;
  variant?: PanelVariant;
  class?: string;
  'data-tutorial'?: string;
  children: JSX.Element;
}

export const DashboardPanel: ParentComponent<DashboardPanelProps> = (props) => {
  const variant = () => props.variant ?? 'default';

  return (
    <div
      class={`dashboard-panel dashboard-panel--${variant()}${props.class ? ` ${props.class}` : ''}`}
      data-panel-id={props.id}
      data-tutorial={props['data-tutorial']}
    >
      {props.children}
    </div>
  );
};
