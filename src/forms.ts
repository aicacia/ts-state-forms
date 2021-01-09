import { defaultHasher, hash } from "@aicacia/core";
import { Changeset, ChangesetError, IChangesetError } from "@aicacia/changeset";
import { debounce } from "@aicacia/debounce";
import { State, Store } from "@aicacia/state";
import type { IJSONObject } from "@aicacia/json";
import { List, Map, Record as ImmutableRecord, RecordOf } from "immutable";
import {
  createElement,
  PureComponent,
  ComponentClass,
  ChangeEventHandler,
  FocusEventHandler,
  FocusEvent,
  ChangeEvent,
  ComponentType,
  Consumer,
  RefObject,
  createRef,
  useEffect,
  ComponentElement,
  useMemo,
  useState,
} from "react";
import { v4 } from "uuid";

export interface IForms {
  forms: Map<string, RecordOf<IForm<any>>>;
}

export const Forms = ImmutableRecord<IForms>({
  forms: Map(),
});

export const INITIAL_STATE = Forms();
export const STORE_NAME = "@aicacia/state-forms";

export interface IField<V> {
  value: V;
  visited: boolean;
  focus: boolean;
  errors: List<RecordOf<IChangesetError>>;
}

export const Field = ImmutableRecord<IField<any>>({
  value: null,
  visited: false,
  focus: false,
  errors: List(),
});

export interface IForm<T extends Record<string, any>> {
  valid: boolean;
  fields: Map<keyof T, RecordOf<IField<T[keyof T]>>>;
  errors: List<RecordOf<IChangesetError>>;
}

export const Form = ImmutableRecord<IForm<any>>({
  valid: true,
  fields: Map(),
  errors: List(),
});

export interface IInputProps<V> {
  error: boolean;
  errors: List<RecordOf<IChangesetError>>;
  value?: V;
  focus: boolean;
  onChange: ChangeEventHandler<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >;
  onBlur: FocusEventHandler<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >;
  onFocus: FocusEventHandler<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >;
  change(value: V): void;
}

export type IGetValueFn<V> = (
  e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
) => V | undefined;

export type IFieldProps<
  P extends IInputProps<T[keyof T]>,
  T extends Record<string, any>
> = Pick<P, Exclude<keyof P, keyof IInputProps<T[keyof T]>>> & {
  name: keyof T;
  Component: ComponentType<P> | "input" | "select" | "textarea";
  getValue?: IGetValueFn<T[keyof T]>;
  onChange?: ChangeEventHandler<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >;
  onBlur?: FocusEventHandler<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >;
  onFocus?: FocusEventHandler<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >;
};

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export const DEFAULT_TIMEOUT = 250;

export interface IFormProps<T extends Record<string, any>> {
  defaults?: Partial<T>;
  onFormChange?(props: IInjectedFormProps<T>): void;
  onFormChangeValid?(props: IInjectedFormProps<T>): void;
}

export interface IInjectedFormProps<T extends Record<string, any>>
  extends IFormProps<T> {
  valid: boolean;
  formId: string;
  Field: ComponentClass<IFieldProps<any, T>>;
  change(name: keyof T, value: T[keyof T]): void;
  unsafeChange(name: keyof T, value: T[keyof T]): void;
  addFormError(error: RecordOf<IChangesetError>): void;
  addFieldError(field: keyof T, error: RecordOf<IChangesetError>): void;
  resetForm(): void;
  getChangeset(): Changeset<T>;
  getForm(): RecordOf<IForm<T>>;
  getFormData(): Map<keyof T, T[keyof T]>;
}

export interface IOptions<T extends Record<string, any>> {
  name?: string;
  timeout?: number;
  changeset(changeset: Changeset<T>): Changeset<T>;
}

export type IValidator = () => Promise<void>;
export interface IValidators {
  [formId: string]: IValidator;
}

type IChangesetFn<T> = (
  changeset: Changeset<T>,
  props: IInjectedFormProps<T>
) => Changeset<T>;

export interface IChangesets {
  [formId: string]: Changeset<any>;
}

export type IStateWithForms = Record<typeof STORE_NAME, RecordOf<IForms>>;

const defaultPropsField = {
  getValue(e: Event): any {
    return ((e as any)?.target as any)?.value;
  },
};

export function fromJSON(json: IJSONObject): RecordOf<IForms> {
  return Forms({
    forms: Object.entries(json.forms as Record<string, IJSONObject>).reduce(
      (forms, [id, form]) =>
        forms.set(
          id,
          Form({
            valid: form.valid as boolean,
            fields: Object.entries(
              form.fields as Record<string, IJSONObject>
            ).reduce(
              (fields, [name, field]) => fields.set(name, Field(field)),
              Map<string, RecordOf<IField<any>>>()
            ),
            errors: (form.errors as Array<IJSONObject>).reduce(
              (errors, error) => errors.push(ChangesetError(error)),
              List<RecordOf<IChangesetError>>()
            ),
          })
        ),
      Map<string, RecordOf<IForm<any>>>()
    ),
  });
}

function updateForms(
  store: Store<IStateWithForms, RecordOf<IForms>>,
  updateFn: (
    forms: Map<string, RecordOf<IForm<any>>>
  ) => Map<string, RecordOf<IForm<any>>>
) {
  return store.update((state) => state.update("forms", updateFn));
}

function validateForm<T extends Record<string, any>>(
  form: RecordOf<IForm<T>>,
  props: IInjectedFormProps<T>,
  changeset: Changeset<T>,
  changesetFn: IChangesetFn<T>
) {
  const values: T = form
    .get("fields", Map<string, RecordOf<IField<T[keyof T]>>>())
    .filter((field) => field.has("value"))
    .map((field) => field.get("value"))
    .toJS() as any;

  changeset = changesetFn(changeset.addChanges(values).clearErrors(), props);

  let valid = true;
  const fields = form
    .get("fields", Map<keyof T, RecordOf<IField<T[keyof T]>>>())
    .map((field, key) => {
      const errors = changeset.getErrorList(key);

      if (!errors.isEmpty()) {
        valid = false;
      }
      if (field.get("visited")) {
        return field.set("errors", errors);
      } else {
        return field;
      }
    });

  if (valid && fields.isEmpty()) {
    valid = false;
  }

  return form.set("valid", valid).set("fields", fields);
}

export function createForms<S extends IStateWithForms>(
  state: State<S>,
  Consumer: Consumer<RecordOf<S>>
) {
  const forms: Store<IStateWithForms, RecordOf<IForms>> = state.getStore(
      STORE_NAME as any
    ) as any,
    validators: IValidators = {},
    changesets: IChangesets = {};

  function createForm<T extends Record<string, any>>(
    props: IInjectedFormProps<T>,
    changesetFn: IChangesetFn<T>,
    timeout: number,
    formName?: string
  ): string {
    const formId = (formName || "") + v4(),
      changeset = new Changeset<T>(props.defaults || {});

    changesets[formId] = changeset;

    resetForm<T>(formId, props, changeset, changesetFn);

    function validator() {
      updateForms(forms, (state) =>
        state.set(
          formId,
          validateForm(state.get(formId, Form()), props, changeset, changesetFn)
        )
      );

      const valid = selectForm<T>(state.getCurrent(), formId).get("valid");

      if (props) {
        if (props.onFormChange && typeof props.onFormChange === "function") {
          props.onFormChange(props);
        }
        if (
          valid &&
          props.onFormChangeValid &&
          typeof props.onFormChangeValid === "function"
        ) {
          props.onFormChangeValid(props);
        }
      }
    }

    let wrappedValidator: IValidator;

    if (!timeout) {
      wrappedValidator = () => {
        validator();
        return Promise.resolve();
      };
    } else {
      wrappedValidator = () =>
        new Promise<void>((resolve) =>
          debounce(validator, timeout, { after: resolve })
        );
    }

    validators[formId] = wrappedValidator;

    return formId;
  }

  function removeForm(formId: string) {
    updateForms(forms, (forms) => forms.remove(formId));
    delete changesets[formId];
    delete validators[formId];
  }

  function resetForm<T extends Record<string, any>>(
    formId: string,
    props: IInjectedFormProps<T>,
    changeset: Changeset<T>,
    changesetFn: IChangesetFn<T>
  ) {
    const fields = Object.keys(props.defaults || {}).reduce(
      (form, key) =>
        form.set(
          key as any,
          Field({
            value: ((props.defaults || {}) as any)[key],
          })
        ),
      Map<keyof T, RecordOf<IField<T[keyof T]>>>()
    );

    updateForms(forms, (forms) =>
      forms.set(
        formId,
        validateForm(Form({ fields }), props, changeset, changesetFn)
      )
    );
  }

  function selectForm<T extends Record<string, any>>(
    state: RecordOf<S>,
    formId: string
  ): RecordOf<IForm<T>> {
    return state.get(STORE_NAME).forms.get(formId, Form()) as RecordOf<
      IForm<T>
    >;
  }

  function selectFormExists(state: RecordOf<S>, formId: string): boolean {
    return state.get(STORE_NAME).forms.has(formId);
  }

  function selectField<T extends Record<string, any>>(
    state: RecordOf<S>,
    formId: string,
    name: keyof T
  ): RecordOf<IField<T[keyof T]>> {
    return selectForm<T>(state, formId).fields.get(name, Field());
  }

  function updateForm<T extends Record<string, any>>(
    formId: string,
    update: (form: RecordOf<IForm<T>>) => RecordOf<IForm<T>>
  ) {
    return updateForms(forms, (forms) =>
      forms.set(formId, update(forms.get(formId, Form()) as any))
    );
  }

  function selectFormErrors(state: RecordOf<S>, formId: string) {
    return selectForm(state, formId).errors;
  }

  function selectFieldErrors<T extends Record<string, any>>(
    state: RecordOf<S>,
    formId: string,
    field: keyof T
  ) {
    return selectField(state, formId, field).errors;
  }

  function addFormError(formId: string, error: RecordOf<IChangesetError>) {
    updateForms(forms, (forms) => {
      return forms.set(
        formId,
        forms
          .get(formId, Form())
          .update("errors", (errors) => errors.push(error))
      );
    });
  }

  function addFieldError<T extends Record<string, any>>(
    formId: string,
    field: keyof T,
    error: RecordOf<IChangesetError>
  ) {
    updateForms(forms, (forms) => {
      const form: RecordOf<IForm<T>> = forms.get(formId, Form()) as any;

      return forms.set(
        formId,
        form.update("fields", (fields) =>
          fields.update(field, (field) =>
            field.update("errors", (errors) => errors.push(error))
          )
        )
      );
    });
  }

  function updateField<T extends Record<string, any>>(
    formId: string,
    name: keyof T,
    update: (
      field: RecordOf<IField<T[keyof T]>>
    ) => RecordOf<IField<T[keyof T]>>,
    invalidate = true
  ) {
    updateForms(forms, (forms) => {
      const form: RecordOf<IForm<T>> = forms.get(formId, Form()) as any,
        fields = form.get(
          "fields",
          Map<keyof T, RecordOf<IField<T[keyof T]>>>()
        ),
        field: RecordOf<IField<T[keyof T]>> = fields.get(name, Field());

      let updatedForm = form.set("fields", fields.set(name, update(field)));

      if (invalidate) {
        updatedForm = updatedForm.set("valid", false);
      }

      return forms.set(formId, updatedForm);
    });
  }

  function unsafeChangeField<T extends Record<string, any>>(
    formId: string,
    name: keyof T,
    value?: T[keyof T],
    invalidate = true
  ) {
    return updateField(
      formId,
      name,
      (field) => field.set("visited", true).set("value", value as any),
      invalidate
    );
  }

  function changeField<T extends Record<string, any>>(
    formId: string,
    name: keyof T,
    value?: T[keyof T],
    invalidate = true
  ) {
    unsafeChangeField(formId, name, value, invalidate);
    return validators[formId]();
  }

  function removeField<T extends Record<string, any>>(
    formId: string,
    name: keyof T
  ) {
    updateForms(forms, (forms) => {
      const form: RecordOf<IForm<T>> = forms.get(formId, Form()) as any,
        fields = form.get(
          "fields",
          Map<keyof T, RecordOf<IField<T[keyof T]>>>()
        );

      if (form && fields.has(name)) {
        return forms.set(formId, form.set("fields", fields.remove(name)));
      } else {
        return forms;
      }
    });
  }

  function createFieldComponent<
    P extends IInputProps<T[keyof T]>,
    T extends Record<string, any>
  >(formId: string): ComponentClass<IFieldProps<P, T>> {
    return class FieldComponent extends PureComponent<IFieldProps<P, T>> {
      static defaultProps = defaultPropsField;

      change = (value: T[keyof T]) =>
        changeField(formId, this.props.name, value);
      unsafeChange = (value: T[keyof T]) =>
        unsafeChangeField(formId, this.props.name, value);
      onChange = (
        e: ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >
      ) => {
        this.props.onChange && e.persist();
        changeField<T>(
          formId,
          this.props.name,
          (this.props.getValue as IGetValueFn<T[keyof T]>)(e)
        ).then(() => this.props.onChange && this.props.onChange(e));
      };
      onBlur = (
        e: FocusEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >
      ) => {
        this.props.onBlur && e.persist();
        updateField<T>(
          formId,
          this.props.name,
          (field) => field.set("focus", false),
          false
        );
        validators[formId]().then(
          () => this.props.onBlur && this.props.onBlur(e)
        );
      };
      onFocus = (
        e: FocusEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >
      ) => {
        this.props.onFocus && e.persist();
        updateField<T>(
          formId,
          this.props.name,
          (field) => field.set("visited", true).set("focus", true),
          false
        );
        this.props.onFocus && this.props.onFocus(e);
      };
      consumerRender = (state: RecordOf<S>) => {
        const { name, Component, ...props } = this.props,
          field = selectField<T>(state, formId, name),
          value = field.get("value"),
          focus = field.get("focus"),
          errors = field.get("errors");

        return createElement(Component as any, {
          ...props,
          error: !errors.isEmpty(),
          errors,
          value,
          focus,
          change: this.change,
          onChange: this.onChange,
          onBlur: this.onBlur,
          onFocus: this.onFocus,
        });
      };
      componentDidUpdate(prev: IFieldProps<P, T>) {
        if (this.props.name !== prev.name) {
          removeField(formId, prev.name);
        }
      }
      componentWillUnmount() {
        removeField<T>(formId, this.props.name);
      }
      render() {
        return createElement(Consumer, null, this.consumerRender);
      }
    } as any;
  }

  function useForm<T extends Record<string, any>>(
    options: IOptions<T> & IFormProps<T>
  ): IInjectedFormProps<T> {
    const [formProps, setFormProps] = useState<IInjectedFormProps<T>>(
        {} as any
      ),
      formName = options.name || "",
      timeout =
        typeof options.timeout === "number" && options.timeout >= 0
          ? options.timeout
          : DEFAULT_TIMEOUT,
      changesetFn = options.changeset,
      hasher = defaultHasher();

    hash(options, hasher);

    const memoArgs = [hasher.finish()];

    useMemo(() => {
      formProps.defaults = options.defaults;
      formProps.onFormChange = options.onFormChange;
      formProps.onFormChangeValid = options.onFormChangeValid;
      formProps.change = (name: keyof T, value: T[keyof T]) =>
        changeField(formProps.formId, name, value);
      formProps.unsafeChange = (name: keyof T, value: T[keyof T]) =>
        unsafeChangeField(formProps.formId, name, value);
      formProps.addFormError = (error: RecordOf<IChangesetError>) =>
        addFormError(formProps.formId, error);
      formProps.addFieldError = (
        field: keyof T,
        error: RecordOf<IChangesetError>
      ) => addFieldError(formProps.formId, field, error);
      formProps.resetForm = () =>
        resetForm(
          formProps.formId,
          formProps,
          changesets[formProps.formId],
          changesetFn
        );
      formProps.getChangeset = () => changesets[formProps.formId];
      formProps.getForm = () =>
        selectForm(state.getCurrent(), formProps.formId);
      formProps.getFormData = () =>
        selectForm(state.getCurrent(), formProps.formId)
          .get("fields", Map())
          .map((field) => field.get("value"));
      formProps.defaults = options.defaults;
      formProps.onFormChange = options.onFormChange;
      formProps.onFormChangeValid = options.onFormChangeValid;

      formProps.formId = createForm(formProps, changesetFn, timeout, formName);
      formProps.Field = createFieldComponent(formProps.formId);
      formProps.valid = selectForm(state.getCurrent(), formProps.formId).valid;

      setFormProps(formProps);
    }, memoArgs);

    useEffect(() => () => removeForm(formProps.formId), memoArgs);

    return formProps;
  }

  function injectForm<T extends Record<string, any>>(options: IOptions<T>) {
    const formName = options.name || "",
      timeout =
        typeof options.timeout === "number" ? options.timeout : DEFAULT_TIMEOUT,
      changesetFn = options.changeset;

    return <P extends IInjectedFormProps<T>>(
      Component: ComponentType<P>
    ): ComponentClass<Omit<P, keyof IInjectedFormProps<T>> & IFormProps<T>> => {
      return class Form extends PureComponent<P> {
        static displayName = `Form(${
          Component.displayName || Component.name || "Component"
        })`;

        componentRef: RefObject<
          ComponentElement<IInjectedFormProps<T>, any>
        > = createRef();

        private _formId: string;
        private _Field: ComponentClass<IFieldProps<any, T>>;

        constructor(props: P) {
          super(props);

          this._formId = createForm(props, changesetFn, timeout, formName);
          this._Field = createFieldComponent(this._formId);
        }
        getFormId = () => this._formId;
        getField<K extends keyof T>(): ComponentClass<IInputProps<T[K]>> {
          return this._Field as any;
        }
        change = (name: keyof T, value: T[keyof T]) =>
          changeField(this._formId, name, value);
        unsafeChange = (name: keyof T, value: T[keyof T]) =>
          unsafeChangeField(this._formId, name, value);
        addFormError = (error: RecordOf<IChangesetError>) =>
          addFormError(this._formId, error);
        addFieldError = (field: keyof T, error: RecordOf<IChangesetError>) =>
          addFieldError(this._formId, field, error);
        resetForm = () =>
          resetForm(
            this._formId,
            this.props,
            changesets[this._formId],
            changesetFn
          );
        getCurrent = () => state.getCurrent();
        getChangeset = () => changesets[this._formId];
        getForm = () => selectForm(state.getCurrent(), this._formId);
        getFormData = () =>
          selectForm(state.getCurrent(), this._formId)
            .get("fields", Map())
            .map((field) => field.get("value"));
        consumerRender = (state: RecordOf<S>) =>
          createElement(Component, {
            ...this.props,
            ref: this.componentRef,
            formId: this._formId,
            valid: selectForm(state, this._formId).get("valid", true),
            Field: this._Field,
            change: this.change,
            unsafeChange: this.unsafeChange,
            addFormError: this.addFormError,
            addFieldError: this.addFieldError,
            resetForm: this.resetForm,
            getChangeset: this.getChangeset,
            getForm: this.getForm,
            getFormData: this.getFormData,
          });
        componentWillUnmount() {
          removeForm(this._formId);
        }
        render() {
          return createElement(Consumer, null, this.consumerRender);
        }
      } as any;
    };
  }

  return {
    selectForm,
    selectFormExists,
    selectField,
    updateForm,
    selectFormErrors,
    selectFieldErrors,
    addFormError,
    addFieldError,
    updateField,
    changeField,
    removeField,
    forms,
    injectForm,
    useForm,
  };
}
