"use client";

import { Button } from "@/components/ui/Button";
import { Settings, Download, Trash2, Bell, Clock, Shield } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl shadow-lg shadow-teal-500/25">
          <Settings className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Settings</h1>
          <p className="text-slate-500 mt-1">Manage your backup preferences</p>
        </div>
      </div>

      {/* Sync Settings */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Sync Settings</h2>
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Clock className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Sync Interval</h3>
                  <p className="text-sm text-slate-500">How often to sync data from 3CX</p>
                </div>
              </div>
              <select className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-medium">
                <option value="60">Every minute</option>
                <option value="300">Every 5 minutes</option>
                <option value="900">Every 15 minutes</option>
                <option value="3600">Every hour</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Notifications</h2>
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-slate-200">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Bell className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Email Notifications</h3>
                  <p className="text-sm text-slate-500">Get notified about sync errors</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-500"></div>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Security</h2>
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
          <div className="flex items-center justify-between p-4 bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-slate-200">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-violet-100 rounded-lg">
                <Shield className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Change Password</h3>
                <p className="text-sm text-slate-500">Update your account password</p>
              </div>
            </div>
            <Button variant="outline">Change</Button>
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Data Management</h2>
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-slate-200">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-teal-100 rounded-lg">
                  <Download className="h-5 w-5 text-teal-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Export All Data</h3>
                  <p className="text-sm text-slate-500">Download a full backup of all archived data</p>
                </div>
              </div>
              <Button variant="outline">Export</Button>
            </div>
            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-red-50 to-rose-50 rounded-xl border-2 border-red-200">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-red-100 rounded-lg">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-red-700">Danger Zone</h3>
                  <p className="text-sm text-red-600">Permanently delete all archived data</p>
                </div>
              </div>
              <Button variant="danger">Delete All Data</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
