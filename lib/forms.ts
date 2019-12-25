import { Changeset, IChangesetError } from "@aicacia/changeset";
import { debounce } from "@aicacia/debounce";
import { IJSON, IJSONObject } from "@aicacia/json";
import { State, Store } from "@aicacia/state";
import { createContext } from "@aicacia/state-react";
import { List, Map, Record } from "immutable";
import * as React from "react";
import { isNumber } from "util";
import { v4 } from "uuid";

export const INITIAL_STATE = Map<string, Record<IForm<any>>>();
export const STORE_NAME = "forms";

export interface IField<V> {
  value: V;
  visited: boolean;
  focus: boolean;
  errors: List<Record<IChangesetError>>;
}

export const Field = Record<IField<any>>({
  value: "",
  visited: false,
  focus: false,
  errors: List()
});

export interface IForm<T extends {}> {
  valid: boolean;
  fields: Map<keyof T, Record<IField<T[keyof T]>>>;
  errors: List<Record<IChangesetError>>;
}

export const Form = Record<IForm<any>>({
  valid: true,
  fields: Map(),
  errors: List()
});

export type Forms = Map<string, Record<IForm<any>>>;

export interface IInputProps<V> {
  error: boolean;
  errors: List<Record<IChangesetError>>;
  value: V;
  focus: boolean;
  onChange: React.ChangeEventHandler<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >;
  onBlur: React.FocusEventHandler<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >;
  onFocus: React.FocusEventHandler<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >;
  change(value: V): void;
}

export type IGetValueFn<V> = (
  e: React.ChangeEvent<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >
) => V;

export type IFieldProps<P extends IInputProps<T[keyof T]>, T extends {}> = Pick<
  P,
  Exclude<keyof P, keyof IInputProps<T[keyof T]>>
> & {
  name: keyof T;
  Component: React.ComponentType<P> | "input" | "select" | "textarea";
  getValue?: IGetValueFn<T[keyof T]>;
};

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

class FieldComponent<
  P extends IInputProps<T[keyof T]>,
  T extends {}
> extends React.PureComponent<IFieldProps<P, T>> {}

const DEFAULT_TIMEOUT = 1000;

export interface IExposedFormProps<T extends {}> {
  defaults?: Partial<T>;
  onFormChange?(props: IInjectedFormProps<T>): void;
  onFormChangeValid?(props: IInjectedFormProps<T>): void;
}

export interface IInjectedFormProps<T extends {}> extends IExposedFormProps<T> {
  valid: boolean;
  Field: typeof FieldComponent;
  change(name: keyof T, value: T[keyof T]): void;
  unsafeChange(name: keyof T, value: T[keyof T]): void;
  addError(error: Record<IChangesetError>): Record<IForm<T>>;
  addFieldError(
    field: keyof T,
    error: Record<IChangesetError>
  ): Record<IForm<T>>;
  resetForm(): void;
  getState(): Forms;
  getFormId(): string;
  getFormData(): Map<keyof T, T[keyof T]>;
}

export interface IOptions<T extends {}> {
  name?: string;
  timeout?: number;
  changeset(changeset: Changeset<T>): Changeset<T>;
}

export interface IValidators {
  [formId: string]: () => void;
}

type IChangesetFn<T> = (
  changeset: Changeset<T>,
  component: React.ReactElement<IInjectedFormProps<T>>
) => Changeset<T>;

export interface IChangesets {
  [formId: string]: Changeset<any>;
}

export interface IFormState {
  [STORE_NAME]: Forms;
}

const defaultPropsField = {
  getValue(e: Event): any {
    return (e.target as any).value;
  }
};

export const createFormsStore = <S extends IFormState>(
  state: State<S>,
  Consumer: ReturnType<typeof createContext>["Consumer"]
) => {
  const store: Store<S, Forms> = state.getStore(STORE_NAME as any) as any,
    validators: IValidators = {},
    changesets: IChangesets = {};

  store.fromJSON = (json: IJSON) => {
    const formsJSON: IJSONObject = (json || {}) as any;

    return Object.keys(formsJSON).reduce((forms, key) => {
      const jsonForm: IJSONObject = (formsJSON[key] || {}) as any;

      return forms.set(
        key,
        Form({
          valid: !!jsonForm.valid,
          fields: Object.keys(jsonForm.fields || []).reduce((fields, key) => {
            const jsonField: IJSONObject = (jsonForm[key] || {}) as any;
            return fields.set(key, Field(jsonField));
          }, Map<string, Record<IField<any>>>())
        })
      );
    }, Map<string, Record<IForm<any>>>());
  };

  const validateForm = <T extends {}>(
    form: Record<IForm<T>>,
    component: React.ReactElement<IInjectedFormProps<T>>,
    changeset: Changeset<T>,
    changesetFn: IChangesetFn<T>
  ) => {
    const changes: T = form
      .get("fields", Map<string, Record<IField<T[keyof T]>>>())
      .map(field => field.get("value", ""))
      .toJS() as any;

    changeset = changesetFn(
      changeset.addChanges(changes).clearErrors(),
      component
    );

    let valid = true;
    const fields = form
      .get("fields", Map<keyof T, Record<IField<T[keyof T]>>>())
      .map((field, key) => {
        const errors = changeset.getError(key);

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
  };

  const create = <T extends {}>(
    componentRef: React.RefObject<React.ComponentType<any>>,
    changesetFn: IChangesetFn<T>,
    timeout: number,
    defaults: Partial<T>,
    formName?: string
  ): string => {
    const formId = formName + v4(),
      changeset = new Changeset<T>(defaults),
      component: React.ReactElement<IInjectedFormProps<
        T
      >> = componentRef.current as any;

    changesets[formId] = changeset;

    resetForm<T>(formId, defaults, component, changeset, changesetFn);

    const validator = () => {
      const component: React.ReactElement<IInjectedFormProps<
        T
      >> = componentRef.current as any;

      if (component) {
        store.updateState(state =>
          state.set(
            formId,
            validateForm(
              state.get(formId, Form()),
              component,
              changeset,
              changesetFn
            )
          )
        );

        const valid = store
          .getState()
          .get(formId, Form())
          .get("valid");

        if (component.props) {
          if (component.props.onFormChange) {
            component.props.onFormChange(component.props);
          }
          if (valid && component.props.onFormChangeValid) {
            component.props.onFormChangeValid(component.props);
          }
        }
      }
    };

    validators[formId] = timeout > 0 ? debounce(validator, timeout) : validator;

    return formId;
  };

  const remove = (formId: string) => {
    store.updateState(state => state.remove(formId));
    delete changesets[formId];
    delete validators[formId];
  };

  const resetForm = <T extends {}>(
    formId: string,
    defaults: Partial<T>,
    component: React.ReactElement<IInjectedFormProps<T>>,
    changeset: Changeset<T>,
    changesetFn: IChangesetFn<T>
  ) => {
    const fields = Object.keys(defaults || {}).reduce(
      (form, key) =>
        form.set(
          key as any,
          Field({
            value: (defaults as any)[key]
          })
        ),
      Map<keyof T, Record<IField<T[keyof T]>>>()
    );

    store.updateState(state =>
      state.set(
        formId,
        validateForm(Form({ fields }), component, changeset, changesetFn)
      )
    );
  };

  const selectForm = <T extends {}>(
    state: Record<S>,
    formId: string
  ): Record<IForm<T>> => state.get("forms").get(formId, Form());

  const selectFormExists = (state: Record<S>, formId: string): boolean =>
    state.get("forms").has(formId);

  const selectField = <T extends {}>(
    state: Record<S>,
    formId: string,
    name: keyof T
  ): Record<IField<T[keyof T]>> =>
    selectForm<T>(state, formId)
      .get("fields", Map<keyof T, Record<IField<T[keyof T]>>>())
      .get(name, Field());

  const updateForm = <T extends {}>(
    formId: string,
    update: (form: Record<IForm<T>>) => Record<IForm<T>>
  ) =>
    store.updateState(state =>
      state.set(formId, update(state.get(formId, Form())))
    );

  const selectErrors = (state: Record<S>, formId: string) =>
    selectForm(state, formId).get("errors");

  const selectFieldErrors = <T extends {}>(
    state: Record<S>,
    formId: string,
    field: keyof T
  ) => selectField(state, formId, field).get("errors");

  const addError = <T extends {}>(
    formId: string,
    error: Record<IChangesetError>
  ) =>
    store.updateState(state => {
      const form: Record<IForm<T>> = state.get(formId, Form());
      return state.set(
        formId,
        form.update("errors", errors => errors.push(error))
      );
    });

  const addFieldError = <T extends {}>(
    formId: string,
    field: keyof T,
    error: Record<IChangesetError>
  ) =>
    store.updateState(state => {
      const form: Record<IForm<T>> = state.get(formId, Form());
      return state.set(
        formId,
        form.update("fields", fields =>
          fields.update(field, field =>
            field.update("errors", errors => errors.push(error))
          )
        )
      );
    });

  const updateField = <T extends {}>(
    formId: string,
    name: keyof T,
    update: (field: Record<IField<T[keyof T]>>) => Record<IField<T[keyof T]>>
  ) => {
    store.updateState(state => {
      const form: Record<IForm<T>> = state.get(formId, Form()),
        fields = form.get("fields", Map<keyof T, Record<IField<T[keyof T]>>>()),
        field: Record<IField<T[keyof T]>> = fields.get(name, Field());

      return state.set(
        formId,
        form.set("fields", fields.set(name, update(field)))
      );
    });
  };

  const unsafeChangeField = <T extends {}>(
    formId: string,
    name: keyof T,
    value: T[keyof T]
  ) =>
    updateField(formId, name, field =>
      field.set("visited", true).set("value", value)
    );

  const changeField = <T extends {}>(
    formId: string,
    name: keyof T,
    value: T[keyof T]
  ) => {
    unsafeChangeField(formId, name, value);
    validators[formId]();
  };

  const removeField = <T extends {}>(formId: string, name: keyof T) => {
    store.updateState(state => {
      const form: Record<IForm<T>> = state.get(formId, Form()),
        fields = form.get("fields", Map<keyof T, Record<IField<T[keyof T]>>>());

      if (form && fields.has(name)) {
        return state.set(formId, form.set("fields", fields.remove(name)));
      } else {
        return state;
      }
    });
  };

  const createFieldComponent = <T extends {}>(formId: string) =>
    class FieldComponent<
      P extends IInputProps<T[keyof T]>
    > extends React.PureComponent<IFieldProps<P, T>> {
      static defaultProps = defaultPropsField;

      change = (value: T[keyof T]) =>
        changeField(formId, this.props.name, value);
      unsafeChange = (value: T[keyof T]) =>
        unsafeChangeField(formId, this.props.name, value);
      onChange = (
        e: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >
      ) =>
        changeField<T>(
          formId,
          this.props.name,
          (this.props.getValue as IGetValueFn<T[keyof T]>)(e)
        );
      onBlur = () => {
        updateField<T>(formId, this.props.name, field =>
          field.set("focus", false)
        );
        validators[formId]();
      };
      onFocus = () =>
        updateField<T>(formId, this.props.name, field =>
          field.set("visited", true).set("focus", true)
        );
      consumerRender = (state: Record<S>) => {
        const { name, Component, getValue, ...props } = this.props,
          field = selectField<T>(state, formId, name),
          value = field.get("value"),
          focus = field.get("focus"),
          errors = field.get("errors");

        return React.createElement(Component as any, {
          ...props,
          error: !errors.isEmpty(),
          errors,
          value,
          focus,
          change: this.change,
          onChange: this.onChange,
          onBlur: this.onBlur,
          onFocus: this.onFocus
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
        return React.createElement(Consumer, null, this.consumerRender);
      }
    };

  const injectForm = <T extends {}>(options: IOptions<T>) => {
    const formName = options.name || "",
      timeout = isNumber(options.timeout) ? options.timeout : DEFAULT_TIMEOUT,
      changesetFn = options.changeset;

    return <P extends IInjectedFormProps<T>>(
      Component: React.ComponentType<P>
    ): React.ComponentClass<
      Omit<P, keyof IInjectedFormProps<T>> & IExposedFormProps<T>
    > => {
      return class Form extends React.PureComponent<P> {
        static displayName = `Form(${Component.displayName ||
          Component.name ||
          "Component"})`;

        componentRef: React.RefObject<
          React.ComponentType<P>
        > = React.createRef();

        private _formId: string;
        private _Field: typeof FieldComponent;

        constructor(props: P) {
          super(props);

          this._formId = create(
            this.componentRef,
            changesetFn,
            timeout,
            props.defaults || {},
            formName
          );
          this._Field = createFieldComponent<T>(this._formId);
        }
        getFormId = () => this._formId;
        getField = () => this._Field;
        change = (name: keyof T, value: T[keyof T]) =>
          changeField(this._formId, name, value);
        unsafeChange = (name: keyof T, value: T[keyof T]) =>
          unsafeChangeField(this._formId, name, value);
        addError = (error: Record<IChangesetError>) =>
          addError(this._formId, error);
        addFieldError = (field: keyof T, error: Record<IChangesetError>) =>
          addFieldError(this._formId, field, error);
        resetForm = () =>
          resetForm(
            this._formId,
            (this.props as any).defaults || {},
            this as any,
            changesets[this._formId],
            changesetFn
          );
        getState = () => store.state.getState();
        getFormData = () =>
          selectForm(store.state.getState(), this._formId)
            .get("fields", Map())
            .map(field => field.get("value"));
        consumerRender = (state: Record<S>) => {
          return (
            selectFormExists(state, this._formId) &&
            React.createElement(Component, {
              ...this.props,
              ref: this.componentRef,
              valid: selectForm(state, this._formId).get("valid", true),
              Field: this._Field,
              change: this.change,
              unsafeChange: this.unsafeChange,
              addError: this.addError,
              addFieldError: this.addFieldError,
              resetForm: this.resetForm,
              getFormId: this.getFormId,
              getState: this.getState,
              getFormData: this.getFormData
            })
          );
        };
        componentWillUnmount() {
          remove(this._formId);
        }
        render() {
          return React.createElement(Consumer, null, this.consumerRender);
        }
      } as any;
    };
  };

  return {
    create,
    remove,
    selectForm,
    selectFormExists,
    selectField,
    updateForm,
    selectErrors,
    selectFieldErrors,
    addError,
    addFieldError,
    updateField,
    changeField,
    removeField,
    store,
    injectForm
  };
};
