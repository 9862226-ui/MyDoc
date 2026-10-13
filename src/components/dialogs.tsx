"use client";

import { useState } from "react";
import { api, refreshData, useAppData } from "@/lib/client";
import type { Group, Project } from "@/lib/types";
import { TagInput } from "./fields";
import { Banner, Button, Dialog, DialogFooter, Field, Input, Select, Spinner, Textarea } from "./ui";
import { useUI, type ConfirmOptions } from "./ui-context";

function FormFooter({
  busy,
  onCancel,
  submitText = "确定",
}: {
  busy: boolean;
  onCancel: () => void;
  submitText?: string;
}) {
  return (
    <DialogFooter>
      <Button onClick={onCancel}>取消</Button>
      <Button type="submit" variant="primary" loading={busy}>
        {submitText}
      </Button>
    </DialogFooter>
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
    <Dialog
      open={open}
      onClose={onClose}
      title={group ? "重命名分组" : "新建分组"}
      description={group ? undefined : "分组用来放项目，例如「工作」「个人」「客户A」"}
      size="sm"
      bodyClassName="pb-0"
    >
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
      <Field label="分组名称" error={error}>
        <Input
          data-autofocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="例如：工作"
        />
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
    <Dialog open={open} onClose={onClose} title={project ? "编辑项目" : "新建项目"} bodyClassName="pb-0">
      <ProjectForm project={project} groupId={groupId} onDone={onClose} />
    </Dialog>
  );
}

function ProjectForm({ project, groupId, onDone }: { project?: Project; groupId?: number; onDone: () => void }) {
  const { data } = useAppData();
  const ui = useUI();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [group, setGroup] = useState<number | undefined>(project?.groupId ?? groupId ?? data?.groups[0]?.id);
  const { busy, error, submit } = useSubmit(onDone);

  if (!data) return <Spinner />;
  if (!data.groups.length) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted">项目要放在分组里，请先新建一个分组（例如「工作」「个人」）。</p>
        <DialogFooter>
          <Button onClick={onDone}>取消</Button>
          <Button
            variant="primary"
            onClick={() => {
              onDone();
              ui.editGroup();
            }}
          >
            新建分组
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-[18px]"
      onSubmit={(e) => {
        e.preventDefault();
        const body = { name, description, groupId: group };
        void submit(
          () =>
            project ? api(`/api/projects/${project.id}`, { method: "PATCH", body }) : api("/api/projects", { body }),
          project ? "已保存" : "已新建项目",
        );
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
        <Field label="项目名称">
          <Input
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="例如：官网改版"
          />
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
      </div>
      <Field label="简介" hint="会显示在项目名称下面">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="可选" />
      </Field>
      {error && <Banner tone="danger">{error}</Banner>}
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
    <Dialog
      open={!!ids}
      onClose={onClose}
      title={`给 ${ids?.length ?? 0} 个链接添加标签`}
      size="sm"
      bodyClassName="pb-0"
    >
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
      <Field label="标签" error={error} hint="已有的标签会保留">
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
        <>
          <Button onClick={() => onResult(false)}>取消</Button>
          <Button data-autofocus variant={options?.danger ? "danger" : "primary"} onClick={() => onResult(true)}>
            {options?.confirmText ?? "确定"}
          </Button>
        </>
      }
    >
      <div className="text-muted">{options?.message}</div>
    </Dialog>
  );
}
