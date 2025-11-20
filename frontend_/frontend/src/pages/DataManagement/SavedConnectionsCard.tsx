import React from 'react';
import { motion } from 'framer-motion';
import { Database, RefreshCw, Trash2 } from 'lucide-react';
import { StatusMessage } from '../DataManagement'; // reference DataManagement.tsx in parent directory

type Connection = {
  id: string;
  name: string;
  type: string;
  host: string;
  status: 'active' | 'inactive';
};

type Props = {
  connections: Connection[];
  isLoading: boolean;
  selectedConnection: string | null;
  setSelectedConnection: (id: string) => void;
  handleDeleteConnection: (id: string) => void;
  activeConnectionTab: 'details' | 'actions';
  setActiveConnectionTab: (tab: 'details' | 'actions') => void;
  dbActionStatus: { type: 'success' | 'error' | 'info'; message: string } | null;
  availableTables: string[];
  activeDbAction: 'import' | 'export' | null;
  selectedTable: string;
  setSelectedTable: (table: string) => void;
  importDatasetName: string;
  setImportDatasetName: (name: string) => void;
  isListingTables: boolean;
  isImporting: boolean;
  isExporting: boolean;
  exportCreateTable: boolean;
  setExportCreateTable: (value: boolean) => void;
  handleDbActionClick: (action: 'import' | 'export') => void;
  handleImportData: () => void;
  handleExportData: () => void;
};

const SavedConnectionsCard: React.FC<Props> = ({
  connections,
  isLoading,
  selectedConnection,
  setSelectedConnection,
  handleDeleteConnection,
  activeConnectionTab,
  setActiveConnectionTab,
  dbActionStatus,
  availableTables,
  activeDbAction,
  selectedTable,
  setSelectedTable,
  importDatasetName,
  setImportDatasetName,
  isListingTables,
  isImporting,
  isExporting,
  exportCreateTable,
  setExportCreateTable,
  handleDbActionClick,
  handleImportData,
  handleExportData
}) => (
  <motion.section
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.5, delay: 0.1 }}
    className="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-lg border border-gray-200/80 dark:border-gray-600/80 flex-1 overflow-hidden flex flex-col"
  >
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
          <Database className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        </div>
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Saved Connections</h2>
      </div>
      <button
        onClick={() => { /* caller should pass fetchConnections separately if needed */ }}
        className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
      >
        <RefreshCw className="w-5 h-5" />
      </button>
    </div>

    <div className="overflow-y-auto flex-1">
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <motion.div className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : connections.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No saved connections
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map(connection => (
            <div
              key={connection.id}
              className={`p-4 rounded-lg border transition-all duration-200 ${
                selectedConnection === connection.id
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {connection.name}
                  </h3>
                  <div className="mt-1 flex items-center gap-3">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{connection.type}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{connection.host}</span>
                    <span className={`text-xs ${
                      connection.status === 'active'
                        ? 'text-green-500 dark:text-green-400'
                        : 'text-red-500 dark:text-red-400'
                    }`}>{connection.status}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedConnection(connection.id)}
                    className={`p-2 rounded-md transition-colors ${
                      selectedConnection === connection.id
                        ? 'text-purple-600 dark:text-purple-400'
                        : 'text-gray-400 hover:text-purple-600 dark:text-gray-500 dark:hover:text-purple-400'
                    }`}
                  >
                    <Database className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteConnection(connection.id)}
                    className="p-2 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 rounded-md transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

    {selectedConnection && (
      <div className="mt-4">
        {/* Connection Tabs */}
        <div className="flex space-x-4 border-b">
          <button
            onClick={() => setActiveConnectionTab('details')}
            className={`px-4 py-2 ${
              activeConnectionTab === 'details'
                ? 'border-b-2 border-purple-500 text-purple-600'
                : 'text-gray-500'
            }`}
          >Details</button>
          <button
            onClick={() => setActiveConnectionTab('actions')}
            className={`px-4 py-2 ${
              activeConnectionTab === 'actions'
                ? 'border-b-2 border-purple-500 text-purple-600'
                : 'text-gray-500'
            }`}
          >Actions</button>
        </div>

        {activeConnectionTab === 'actions' && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => handleDbActionClick('import')}
                className="px-4 py-2 bg-blue-600 text-white rounded"
              >Import Data from DB</button>
              <button
                onClick={() => handleDbActionClick('export')}
                className="px-4 py-2 bg-green-600 text-white rounded"
              >Export Data to DB</button>
            </div>

            {dbActionStatus && (
              <StatusMessage
                status={dbActionStatus.type === 'error' ? 'error' : 'success'}
                message={dbActionStatus.message}
                type="connection"
              />
            )}
            {isListingTables && <p className="text-sm text-gray-500">Loading tables…</p>}

            {activeDbAction === 'import' && (
              <div className="mt-4 space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Table:</label>
                <select
                  value={selectedTable}
                  onChange={e => setSelectedTable(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                >
                  <option value="">Select table</option>
                  {availableTables.map(table => (
                    <option key={table} value={table}>{table}</option>
                  ))}
                </select>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Dataset Name:</label>
                <input
                  type="text"
                  value={importDatasetName}
                  onChange={e => setImportDatasetName(e.target.value)}
                  placeholder="Dataset name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                />
                <button
                  onClick={handleImportData}
                  disabled={isImporting}
                  className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
                >{isImporting ? 'Importing…' : 'Start Import'}</button>
              </div>
            )}

            {activeDbAction === 'export' && (
              <div className="mt-4 space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Table:</label>
                <select
                  value={selectedTable}
                  onChange={e => setSelectedTable(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                >
                  <option value="">Select table</option>
                  {availableTables.map(table => (
                    <option key={table} value={table}>{table}</option>
                  ))}
                </select>
                <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={exportCreateTable}
                    onChange={e => setExportCreateTable(e.target.checked)}
                    className="mr-2"
                  />Create Table if not exists
                </label>
                <button
                  onClick={handleExportData}
                  disabled={isExporting}
                  className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
                >{isExporting ? 'Exporting…' : 'Start Export'}</button>
              </div>
            )}
          </div>
        )}
      </div>
    )}
  </motion.section>
);

export default SavedConnectionsCard; 