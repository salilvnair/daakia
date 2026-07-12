import { WikiScrollPage, CaptureCard } from '../capture/CaptureScrollView';
import { WikiHero, Steps, FeatureGrid, Callout, Badge, chips } from '../shared/WikiShared';
import { GRPC_CAPTURES } from './captures';

export function GrpcView() {
  const byId = Object.fromEntries(GRPC_CAPTURES.map(c => [c.id, c]));
  return (
    <WikiScrollPage hero={
      <WikiHero
        emoji="🟣"
        title="gRPC Client"
        subtitle="Call unary and streaming RPCs — import a .proto file for auto-discovery, or use server reflection."
        chips={chips(['Unary', 'Streaming', 'Proto Import', 'Reflection'])}
      />
    }>
      <div>
        <Callout type="info" title="Activate">
          Click the <Badge variant="grpc">gRPC</Badge> icon in the left protocol rail to switch to gRPC mode.
        </Callout>
        <FeatureGrid items={[
          { emoji: '📜', title: 'Proto Import', desc: 'Load .proto files to discover services and methods automatically.' },
          { emoji: '🔄', title: 'Streaming', desc: 'Unary, server streaming, client streaming, and bidirectional streaming.' },
          { emoji: '🔑', title: 'TLS + Auth', desc: 'Configure TLS certificates and gRPC metadata for auth.' },
          { emoji: '📁', title: 'Collections', desc: 'Save gRPC calls to collections, inherit auth.' },
          { emoji: '🎭', title: 'Mock Server', desc: 'gRPC mock server with configurable method responses and delays.' },
        ]} />
        <Steps steps={[
          'Click <strong>gRPC</strong> icon in the left protocol rail',
          'Import a .proto file — Daakia discovers all services and methods',
          'Select a service and method from the dropdowns',
          'Fill in the request JSON body (auto-generated from proto schema)',
          'Click <strong>Invoke</strong> to execute',
        ]} />
      </div>

      {byId['grpc-message'] && <CaptureCard entry={byId['grpc-message']} />}
      {byId['grpc-proto'] && <CaptureCard entry={byId['grpc-proto']} />}
      {byId['grpc-auth'] && <CaptureCard entry={byId['grpc-auth']} />}
    </WikiScrollPage>
  );
}
