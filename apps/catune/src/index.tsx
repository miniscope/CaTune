import { render } from 'solid-js/web';
import App from './App.tsx';
import '@catune/ui/styles/layout.css';
import './styles/global.css';
import './styles/layout.css';

render(() => <App />, document.getElementById('root')!);
