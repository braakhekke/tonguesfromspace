import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import 'leaflet/dist/leaflet.css';
import './base.css';
import { Wizard } from './Wizard';
import { onRoute, parts } from './nav';

function App() {
  const [p, setP] = useState(parts());
  useEffect(() => onRoute(() => setP(parts())), []);
  return <Wizard parts={p} />;
}
render(<App />, document.getElementById('app')!);
