import * as React from "react";
import { Map, Record } from "immutable";
import { State, Store } from "@stembord/state";
import { Changeset, IError } from "@stembord/changeset";
import { debounce } from "ts-debounce";
import { v4 } from "uuid";
import { IConsumer } from "@stembord/state-react";

export const INITIAL_STATE = Map<string, Record<IForm>>();
export const STORE_NAME = "forms";

export type IExtractGeneric<Type> = Type extends React.ComponentType<infer X>
  ? X
  : Type;

export interface IField<T = any> {
  value: T;
  focus: boolean;
  errors: IError[];
}

export const Field = Record<IField>({
  value: "",
  focus: false,
  errors: []
});

export interface IForm {
  valid: boolean;
  fields: Map<string, Record<IField>>;
}

export const Form = Record<IForm>({
  valid: true,
  fields: Map()
});

export type Forms = Map<string, Record<IForm>>;

export interface IInputProps {
  error: boolean;
  errors: IError[];
  value: any;
  onChange: React.ChangeEventHandler<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >;
  onBlur: React.FocusEventHandler<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >;
  onFocus: React.FocusEventHandler<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >;
}

export type IFieldProps<T extends IInputProps> = Pick<
  T,
  Exclude<keyof T, keyof IInputProps>
> & {
  name: string;
  Component: React.ComponentType<T> | "input" | "select" | "textarea";
  getValue?: (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => any;
};

export interface IFormProps<D = {}> {
  defaults?: D;
}

class FieldComponent<T extends IInputProps> extends React.PureComponent<
  IFieldProps<T>
> {}

export interface IInjectedFormProps {
  valid: boolean;
  Field: typeof FieldComponent;
  setErrors(errors: { [key: string]: IError[] }): Record<IForm>;
  resetForm(): void;
  getFormData(): Map<string, any>;
}

export interface IOptions {
  timeout?: number;
  changeset(changeset: Changeset): Changeset;
}

export interface IValidators {
  [key: string]: () => void;
}

export type IFormState = { [STORE_NAME]: Forms };

const defaultPropsField = {
  getValue(e: Event): any {
    return (e.target as any).value;
  }
};

export const createFormsStore = <S extends IFormState>(
  state: State<S>,
  Consumer: IConsumer<S>
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
          }, Map<string, Record<IField>>())
        })
      );
    }, Map<string, Record<IForm>>());
  };

  const create = <D>(
    changesetFn: (changeset: Changeset) => Changeset,
    timeout: number,
    defaults?: D
  ) => {
    const formId = v4();

    resetForm(formId, defaults || {});

    const changeset = new Changeset({ ...(defaults as any) });
    validators[formId] = debounce(() => {
      const changes = store
        .getState()
        .get(formId, Form())
        .get("fields", Map<string, Record<IField>>())
        .map(field => field.get("value", ""))
        .toJS();

      changeset.addChanges(changes);
      changeset.clearErrors();
      changesetFn(changeset);

      store.updateState(state => {
        let valid = true;

        const form: Record<IForm> = state.get(formId, Form()),
          fields = form
            .get("fields", Map<string, Record<IField>>())
            .map((field, key) => {
              const errors = changeset.getError(key);

              if (errors.length !== 0) {
                valid = false;
              }
              return field.set("errors", errors);
            });

        return state.set(
          formId,
          form.set("valid", valid).set("fields", fields)
        );
      });
    }, timeout);

    return formId;
  };

  const remove = (formId: string) => {
    store.updateState(state => state.remove(formId));
    delete validators[formId];
  };

  const resetForm = <D>(formId: string, defaults: D) => {
    const fields = Object.keys(defaults || {}).reduce(
      (form, key) =>
        form.set(
          key,
          Field({
            value: (defaults as any)[key]
          })
        ),
      Map<string, Record<IField>>()
    );

    store.updateState(state => state.set(formId, Form({ fields })));
  };

  const selectForm = ({ forms }: S, formId: string): Record<IForm> =>
    forms.get(formId, Form());

  const selectField = <T = any>(
    state: S,
    formId: string,
    name: string
  ): Record<IField<T>> =>
    selectForm(state, formId)
      .get("fields", Map<string, Record<IField>>())
      .get(name, Field());

  const updateForm = (
    formId: string,
    update: (form: Record<IForm>) => Record<IForm>
  ) => {
    store.updateState(state =>
      state.set(formId, update(state.get(formId, Form())))
    );
  };

  const setErrors = (formId: string, errors: { [key: string]: IError[] }) => {
    store.updateState(state => {
      const form: Record<IForm> = state.get(formId, Form()),
        fields = Object.keys(errors).reduce((fields, key) => {
          const errorArray = errors[key],
            field = fields.get(key);

          if (errorArray && field) {
            fields = fields.set(key, field.set("errors", errorArray));
          }

          return fields;
        }, form.get("fields", Map<string, Record<IField>>()));

      return state.set(formId, form.set("fields", fields));
    });
  };

  const updateField = <T = any>(
    formId: string,
    name: string,
    update: (field: Record<IField<T>>) => Record<IField<T>>
  ) => {
    store.updateState(state => {
      const form: Record<IForm> = state.get(formId, Form()),
        fields = form.get("fields", Map<string, Record<IField>>()),
        field: Record<IField> = fields.get(name, Field());

      return state.set(
        formId,
        form.set("fields", fields.set(name, update(field)))
      );
    });
  };

  const removeField = (formId: string, name: string) => {
    store.updateState(state => {
      const form: Record<IForm> = state.get(formId, Form()),
        fields = form.get("fields", Map<string, Record<IField>>());

      if (form) {
        return state.set(formId, form.set("fields", fields.remove(name)));
      } else {
        return state;
      }
    });
  };

  const createFieldComponent = (formId: string) => {
    return class FieldComponent<
      T extends IInputProps
    > extends React.PureComponent<IFieldProps<T>> {
      static defaultProps = defaultPropsField;

      onChange = (
        e: React.ChangeEventHandler<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >
      ) => {
        const { name, getValue } = this.props;

        validators[formId]();

        updateField(formId, name, field =>
          field.set("value", (getValue as any)(e))
        );
      };
      onBlur = () => {
        const { name } = this.props;
        updateField(formId, name, field => field.set("focus", false));
      };
      onFocus = () => {
        const { name } = this.props;
        updateField(formId, name, field => field.set("focus", true));
      };
      consumerRender = (state: S) => {
        const { name, Component, getValue, ...props } = this.props,
          field = selectField(state, formId, name),
          value = field.get("value"),
          errors = field.get("errors");

        return React.createElement(Component as any, {
          ...props,
          error: errors.length !== 0,
          errors: errors,
          value: value,
          onChange: this.onChange,
          onBlur: this.onBlur,
          onFocus: this.onFocus
        });
      };
      componentDidUpdate(prev: IFieldProps<T>) {
        const { name } = this.props;

        if (name !== prev.name) {
          removeField(formId, prev.name);
        }
      }
      render() {
        return React.createElement(Consumer, null, this.consumerRender);
      }
    };
  };

  const injectForm = <D>(options: IOptions) => {
    const timeout = options.timeout || 300,
      changesetFn = options.changeset;

    return <P extends IInjectedFormProps & IFormProps<D>>(
      Component: React.ComponentType<P>
    ): React.ComponentClass<
      Pick<P, Exclude<keyof P, keyof IInjectedFormProps>>
    > & { WrappedComponent: React.ComponentType<P> } => {
      return class Form extends React.PureComponent<P> {
        static displayName = `Form(${Component.displayName ||
          Component.name ||
          "Component"})`;

        private _formId: string;
        private _Field: typeof FieldComponent;

        constructor(props: P) {
          super(props);

          this._formId = create(changesetFn, timeout, props.defaults);
          this._Field = createFieldComponent(this._formId);
        }
        getFormId = () => {
          return this._formId;
        };
        getField = () => {
          return this._Field;
        };
        setErrors = (errors: { [key: string]: IError[] }) => {
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
        consumerRender = (state: S) => {
          return React.createElement(Component, {
            ...this.props,
            valid: selectForm(state, this._formId).get("valid", true),
            Field: this._Field,
            setErrors: this.setErrors,
            resetForm: this.resetForm,
            getFormData: this.getFormData
          });
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
    selectField,
    updateForm,
    setErrors,
    updateField,
    removeField,
    store,
    injectForm
  };
};