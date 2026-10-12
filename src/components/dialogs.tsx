"use client";

import { useState } from "react";
import { api, refreshData, useAppData } from "@/lib/client";
import type { Group, Project } from "@/lib/types";
import { TagInput } from "./fields";
import { Button, Dialog, Field, Input, Select, Spinner, Textarea } from "./ui";
import { useUI, type ConfirmOptions } from "./ui-context";

function FormFooter({ busy, onCancel, submitText = "保存" }: { busy: boolean; onCancel: () => void; submitText?: string }) {
  return (
    <div className="-mx-5 -mb-4 mt-4 flex justify-end gap-2 border-t border-line px-5 py-3">
      <Button onClick={onCancel}>取消</Button>
      <Button type="submit" variant="primary" disabled={busy}>
        {busy && <Spinner size={14} />}
        {submitText}
      </Button>
    </div>
  );
}

function useSubmit(onDone: () => void) {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refreshData();
      ui.toast(message);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

export function GroupDialog({ open, onClose, group }: { open: boolean; onClose: () => void; group?: Group }) {
  return (
    <Dialog open={open} onClose={onClose} title={group ? "重命名分组" : "新建分组"} size="sm">
      <GroupForm group={group} onDone={onClose} />
    </Dialog>
  );
}

function GroupForm({ group, onDone }: { group?: Group; onDone: () => void }) {
  const [name, setName] = useState(group?.name ?? "");
  const { busy, error, submit } = useSubmit(onDone);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(
          () =>
            group
              ? api(`/api/groups/${group.id}`, { method: "PATCH", body: { name } })
              : api("/api/groups", { body: { name } }),
          group ? "已重命名" : "已新建分组",
        );
      }}
    >
      <Field label="分组名称" error={error} hint="例如：工作、个人、客户A">
        <Input data-autofocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </Field>
      <FormFooter busy={busy} onCancel={onDone} />
    </form>
  );
}

export function ProjectDialog({
  open,
  onClose,
  project,
  groupId,
}: {
  open: boolean;
  onClose: () => void;
  project?: Project;
  groupId?: number;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={project ? "编辑项目" : "新建项目"}>
      <ProjectForm project={project} groupId={groupId} onDone={onClose} />
    </Dialog>
  );
}

function ProjectForm({ project, groupId, onDone }: { project?: Project; groupId?: number; onDone: () => void }) {
  const { data } = useAppData();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [group, setGroup] = useState<number | undefined>(project?.groupId ?? groupId ?? data?.groups[0]?.id);
  const { busy, error, submit } = useSubmit(onDone);

  if (!data) return <Spinner />;
  if (!data.groups.length) {
    return <p className="text-[13px] text-muted">请先新建一个分组，项目要放在分组里。</p>;
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const body = { name, description, groupId: group };
        void submit(
          () =>
            project
              ? api(`/api/projects/${project.id}`, { method: "PATCH", body })
              : api("/api/projects", { body }),
          project ? "已保存" : "已新建项目",
        );
      }}
    >
      <Field label="项目名称">
        <Input data-autofocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </Field>
      <Field label="所属分组">
        <Select value={group} onChange={(e) => setGroup(Number(e.target.value))}>
          {data.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="简介" error={error}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="可选" />
      </Field>
      <FormFooter busy={busy} onCancel={onDone} />
    </form>
  );
}

export function AddTagsDialog({
  ids,
  onClose,
  onDone,
}: {
  ids: number[] | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  return (
    <Dialog open={!!ids} onClose={onClose} title={`给 ${ids?.length ?? 0} 个链接添加标签`} size="sm">
      {ids && <AddTagsForm ids={ids} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function AddTagsForm({ ids, onClose, onDone }: { ids: number[]; onClose: () => void; onDone?: () => void }) {
  const { data } = useAppData();
  const [tags, setTags] = useState<string[]>([]);
  const { busy, error, submit } = useSubmit(() => {
    onClose();
    onDone?.();
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (tags.length)
          void submit(() => api("/api/links/batch", { body: { ids, op: { action: "addTags", tags } } }), "已添加标签");
      }}
    >
      <Field label="标签" error={error}>
        <TagInput autoFocus value={tags} onChange={setTags} suggestions={data?.tags.map((t) => t.name) ?? []} />
      </Field>
      <FormFooter busy={busy} onCancel={onClose} submitText="添加" />
    </form>
  );
}

export function ConfirmDialog({
  options,
  onResult,
}: {
  options: ConfirmOptions | null;
  onResult: (ok: boolean) => void;
}) {
  return (
    <Dialog
      open={!!options}
      onClose={() => onResult(false)}
      title={options?.title}
      size="sm"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button onClick={() => onResult(false)}>取消</Button>
          <Button data-autofocus variant={options?.danger ? "danger" : "primary"} onClick={() => onResult(true)}>
            {options?.confirmText ?? "确定"}
          </Button>
        </div>
      }
    >
      <div className="text-[13px] leading-relaxed text-muted">{options?.message}</div>
    </Dialog>
  );
}
