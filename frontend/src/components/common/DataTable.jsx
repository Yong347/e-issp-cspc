import React from "react";

export default function DataTable({ headers, data, renderRow }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-900 shadow-lg">
      <table className="w-full border-collapse text-left text-sm text-slate-300">
        <thead className="bg-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <tr>
            {headers.map((header, idx) => (
              <th key={idx} className="border-b border-slate-700 px-4 py-3">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {data.length > 0 ? (
            data.map((item, idx) => renderRow(item, idx))
          ) : (
            <tr>
              <td colSpan={headers.length} className="px-4 py-8 text-center text-slate-500">
                No active records found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
