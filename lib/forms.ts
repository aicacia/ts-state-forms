import { Changeset, IChangesetError } from "@aicacia/changeset";
import { debounce } from "@aicacia/debounce";
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
  focus: boolean;
  errors: List<Record<IChangesetError>>;
}

export const Field = Record<IField<any>>({
  value: "",
  focus: false,
  errors: List()
});

export interface IForm<T extends {}> {
  valid: boolean;
  fields: Map<keyof T, Record<IField<T[keyof T]>>>;
}

export const Form = Record<IForm<any>>({
  valid: true,
  fields: Map()
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

class FieldComponent<P extends IInputProps<any>> extends React.PureComponent<
  IFieldProps<P, any>
> {}

export interface IInjectedFormProps<T extends {}> {
  valid: boolean;
  Field: typeof FieldComponent;
  defaults?: Partial<T>;
  change(name: keyof T, value: T[keyof T]): void;
  setErrors(
    errors: { [P in keyof T]: List<IChangesetError> }
  ): Record<IForm<T>>;
  resetForm(): void;
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
    validators: IValidators = {};

  store.fromJSON = (json: any) => {
    json = json || {};

    return Object.keys(json).reduce((forms, key) => {
      const jsonForm = json[key] || {};

      return forms.set(
        key,
        Form({
          valid: !!jsonForm.valid,
          fields: Object.keys(jsonForm.fields || []).reduce((fields, key) => {
            const jsonField = jsonForm[key];
            return fields.set(key, Field(jsonField));
          }, Map<string, Record<IField<any>>>())
        })
      );
    }, Map<string, Record<IForm<any>>>());
  };

  const create = <T extends {}>(
    changesetFn: (changeset: Changeset<T>) => Changeset<T>,
    timeout: number,
    formName?: string,
    defaults?: Partial<T>
  ): string => {
    const formId = formName + v4();

    resetForm<T>(formId, defaults || {});

    let changeset = new Changeset<T>(defaults || {});

    const validator = () => {
      const changes: T = store
        .getState()
        .get(formId, Form())
        .get("fields", Map<string, Record<IField<T[keyof T]>>>())
        .map(field => field.get("value", ""))
        .toJS() as any;

      changeset = changesetFn(changeset.addChanges(changes).clearErrors());

      store.updateState(state => {
        let valid = true;

        const form: Record<IForm<T>> = state.get(formId, Form()),
          fields = form
            .get("fields", Map<keyof T, Record<IField<T[keyof T]>>>())
            .map((field, key) => {
              const errors = changeset.getError(key as any);

              if (errors.size !== 0) {
                valid = false;
              }
              return field.set("errors", errors);
            });

        return state.set(
          formId,
          form.set("valid", valid).set("fields", fields)
        );
      });
    };

    validators[formId] = timeout > 0 ? debounce(validator, timeout) : validator;

    return formId;
  };

  const remove = (formId: string) => {
    store.updateState(state => state.remove(formId));
    delete validators[formId];
  };

  const resetForm = <T extends {}>(formId: string, defaults: Partial<T>) => {
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

    store.updateState(state => state.set(formId, Form({ fields })));
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

  const setErrors = <T extends {}>(
    formId: string,
    errors: Map<keyof T, List<Record<IChangesetError>>>
  ) =>
    store.updateState(state => {
      const form: Record<IForm<T>> = state.get(formId, Form()),
        fields = Object.keys(errors).reduce((fields, key) => {
          const errorArray = errors.get(key as any),
            field = fields.get(key as any);

          if (errorArray && field) {
            fields = fields.set(key as any, field.set("errors", errorArray));
          }

          return fields;
        }, form.get("fields", Map<keyof T, Record<IField<T[keyof T]>>>()));

      return state.set(formId, form.set("fields", fields));
    });

  const updateField = <T extends {}>(
    formId: string,
    name: keyof T,
    update: (field: Record<IField<T[keyof T]>>) => Record<IField<T[keyof T]>>
  ) =>
    store.updateState(state => {
      const form: Record<IForm<T>> = state.get(formId, Form()),
        fields = form.get("fields", Map<keyof T, Record<IField<T[keyof T]>>>()),
        field: Record<IField<T[keyof T]>> = fields.get(name, Field());

      return state.set(
        formId,
        form.set("fields", fields.set(name, update(field)))
      );
    });

  const changeField = <T extends {}>(
    formId: string,
    name: keyof T,
    value: T[keyof T]
  ) => {
    updateField(formId, name, field => field.set("value", value));
    validators[formId]();
  };

  const removeField = <T extends {}>(formId: string, name: keyof T) =>
    store.updateState(state => {
      const form: Record<IForm<T>> = state.get(formId, Form()),
        fields = form.get("fields", Map<keyof T, Record<IField<T[keyof T]>>>());

      if (form) {
        return state.set(formId, form.set("fields", fields.remove(name)));
      } else {
        return state;
      }
    });

  const createFieldComponent = <T extends {}>(formId: string) => {
    return class FieldComponent<
      P extends IInputProps<T[keyof T]>
    > extends React.PureComponent<IFieldProps<P, T>> {
      static defaultProps = defaultPropsField;

      change = (value: T[keyof T]) => {
        changeField(formId, this.props.name, value);
      };
      onChange = (
        e: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >
      ) => {
        changeField<T>(
          formId,
          this.props.name,
          (this.props.getValue as IGetValueFn<T[keyof T]>)(e)
        );
      };
      onBlur = () => {
        updateField<T>(formId, this.props.name, field =>
          field.set("focus", false)
        );
      };
      onFocus = () => {
        updateField<T>(formId, this.props.name, field =>
          field.set("focus", true)
        );
      };
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
      render() {
        return React.createElement(Consumer, null, this.consumerRender);
      }
    };
  };

  const injectForm = <T extends {}>(options: IOptions<T>) => {
    const formName = options.name || "",
      timeout = isNumber(options.timeout) ? options.timeout : 300,
      changesetFn = options.changeset;

    return <P extends IInjectedFormProps<T>>(
      Component: React.ComponentType<P>
    ): React.ComponentClass<
      Omit<P, keyof IInjectedFormProps<T>> & { defaults?: Partial<T> }
    > => {
      return class Form extends React.PureComponent<P> {
        static displayName = `Form(${Component.displayName ||
          Component.name ||
          "Component"})`;

        private _formId: string;
        private _Field: typeof FieldComponent;

        constructor(props: P) {
          super(props);

          this._formId = create(changesetFn, timeout, formName, props.defaults);
          this._Field = createFieldComponent<T>(this._formId);
        }
        getFormId = () => {
          return this._formId;
        };
        getField = () => {
          return this._Field;
        };
        change = (name: keyof T, value: T[keyof T]) => {
          changeField(this._formId, name, value);
        };
        setErrors = (errors: Map<keyof T, List<Record<IChangesetError>>>) => {
          setErrors(this._formId, errors);
        };
        resetForm = () => {
          resetForm(this._formId, (this.props as any).defaults || {});
        };
        getFormData = () => {
          return selectForm(store.state.getState(), this._formId)
            .get("fields", Map())
            .map(field => field.get("value"));
        };
        consumerRender = (state: Record<S>) => {
          return (
            selectFormExists(state, this._formId) &&
            React.createElement(Component, {
              ...this.props,
              valid: selectForm(state, this._formId).get("valid", true),
              Field: this._Field,
              change: this.change,
              setErrors: this.setErrors,
              resetForm: this.resetForm,
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
    setErrors,
    updateField,
    changeField,
    removeField,
    store,
    injectForm
  };
};
