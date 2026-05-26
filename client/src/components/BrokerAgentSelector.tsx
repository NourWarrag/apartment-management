import { useState } from 'react';
import { useAgentSearch, useBroker, Broker, BrokerAgent } from '../hooks/useBrokers';
import BrokerFormModal from '../pages/brokers/BrokerFormModal';
import BrokerAgentFormModal from '../pages/brokers/BrokerAgentFormModal';

export interface BrokerAgentSelection {
  brokerId: number | null;
  agentId: number | null;
}

interface Props {
  value: BrokerAgentSelection;
  onChange: (next: BrokerAgentSelection, agent?: BrokerAgent | null, broker?: Broker | null) => void;
  disabled?: boolean;
  className?: string;
}

export default function BrokerAgentSelector({ value, onChange, disabled, className }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showBrokerModal, setShowBrokerModal] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState<{ brokerId: number } | null>(null);
  const { data: groups = [] } = useAgentSearch(search);

  const { data: currentBroker } = useBroker(value.brokerId ?? -1);
  const currentAgent = currentBroker?.agents.find((a) => a.id === value.agentId) ?? null;
  const displayLabel = value.agentId
    ? `${currentAgent?.fullName ?? `Agent #${value.agentId}`} — ${currentBroker?.name ?? ''}`
    : value.brokerId
      ? `${currentBroker?.name ?? `Broker #${value.brokerId}`} (no agent)`
      : 'No broker selected';

  const inputCls = 'w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary';

  function clear() {
    onChange({ brokerId: null, agentId: null }, null, null);
    setOpen(false);
  }

  function pickAgent(agent: BrokerAgent, broker: { id: number; name: string }) {
    onChange({ brokerId: broker.id, agentId: agent.id }, agent, null);
    setOpen(false);
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={inputCls + ' text-left flex items-center justify-between' + (disabled ? ' opacity-60 cursor-not-allowed' : '')}
      >
        <span className={value.brokerId ? 'text-on-surface' : 'text-on-surface-variant'}>{displayLabel}</span>
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded-lg shadow-lg max-h-96 overflow-y-auto">
          <div className="p-2 border-b border-outline-variant">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search broker or agent…"
              className={inputCls + ' text-xs'}
            />
          </div>

          {value.brokerId !== null && (
            <button type="button" onClick={clear} className="w-full text-left px-3 py-2 text-xs text-error hover:bg-surface-container">
              Clear selection
            </button>
          )}

          {groups.length === 0 && search && (
            <p className="p-3 text-xs text-on-surface-variant">No agents match "{search}".</p>
          )}

          {groups.map((g) => (
            <div key={g.broker.id} className="border-b border-outline-variant last:border-b-0">
              <div className="px-3 py-2 bg-surface-container text-xs font-bold text-on-surface flex items-center justify-between">
                <span>{g.broker.name}</span>
                <button
                  type="button"
                  onClick={() => setShowAgentModal({ brokerId: g.broker.id })}
                  className="text-primary text-xs hover:underline"
                >
                  + Agent
                </button>
              </div>
              {g.agents.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => pickAgent(a, g.broker)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-surface-container flex items-center justify-between"
                >
                  <span>{a.fullName}</span>
                  <span className="text-xs text-on-surface-variant">{a.phone}</span>
                </button>
              ))}
            </div>
          ))}

          <button
            type="button"
            onClick={() => setShowBrokerModal(true)}
            className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-surface-container border-t border-outline-variant"
          >
            + New broker
          </button>
        </div>
      )}

      {showBrokerModal && (
        <BrokerFormModal
          onClose={() => setShowBrokerModal(false)}
          onSaved={(broker) => {
            onChange({ brokerId: broker.id, agentId: null }, null, broker);
            setShowBrokerModal(false);
            setShowAgentModal({ brokerId: broker.id });
          }}
        />
      )}

      {showAgentModal && (
        <BrokerAgentFormModal
          brokerId={showAgentModal.brokerId}
          onClose={() => setShowAgentModal(null)}
          onSaved={(agent) => {
            onChange({ brokerId: agent.brokerId, agentId: agent.id }, agent, null);
            setShowAgentModal(null);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
