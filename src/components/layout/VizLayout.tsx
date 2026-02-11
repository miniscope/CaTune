import type { ParentComponent, JSX } from 'solid-js';

interface VizLayoutProps {
  children: JSX.Element;
}

export const VizLayout: ParentComponent<VizLayoutProps> = (props) => {
  return (
    <div class="viz-layout viz-layout--scroll">
      {props.children}
    </div>
  );
};
