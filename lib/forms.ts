import * as React from "react";
import { Map, Record } from "immutable";
import { State, IState } from "@stembord/state";
import { Changeset, IError } from "@stembord/changeset";
import { debounce } from "ts-debounce";
import { v4 } from "uuid";
import { IConsumer } from "@stembord/state-react";

export interface IField<T = any> {
    value: T;
    focus: boolean;
    error: IError[];
}

export const Field = Record<IField>({
    value: "",
    focus: false,
    error: []
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

export type IFieldProps<T> = T & {
    formId: string;
    name: string;
    getValue?: (
        e: React.ChangeEvent<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >
    ) => any;
    Component: string | React.ComponentType<T & Partial<IInputProps>>;
};

export interface IInjectedFormProps {
    valid: boolean;
    formId: string;
    getForm(): Map<string, any>;
    resetForm(): void;
}

export interface IOptions<D> {
    timeout?: number;
    changeset(changeset: Changeset): Changeset;
}

export interface IValidators {
    [key: string]: () => void;
}

const defaultPropsField = {
    getValue(e: Event): any {
        return (e.target as any).value;
    }
};

export const createFormsStore = (state: State, Consumer: IConsumer<IState>) => {
    const store = state.createStore<Forms>("forms", Map()),
        validators: IValidators = {};

    store.fromJSON = (json: any) => {
        json = json || {};

        return Object.keys(json).reduce((forms, key) => {
            const jsonForm = json[key] || {};

            return forms.set(
                key,
                Form({
                    valid: !!jsonForm.valid,
                    fields: Object.keys(jsonForm.fields || []).reduce(
                        (fields, key) => {
                            const jsonField = jsonForm[key];
                            return fields.set(key, Field(jsonField));
                        },
                        Map<string, Record<IField>>()
                    )
                })
            );
        }, Map<string, Record<IForm>>());
    };

    const create = <D>(
        defaults: D,
        changesetFn: (changeset: Changeset) => Changeset,
        timeout: number
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
                            const error = changeset.getError(key);
                            if (error.length !== 0) {
                                valid = false;
                            }
                            return field.set("error", error);
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

    const selectForm = ({ forms }: IState, formId: string): Record<IForm> =>
        forms.get(formId, Map());

    const selectField = <T = any>(
        state: State,
        formId: string,
        name: string
    ): Record<IField<T>> =>
        selectForm(state, formId)
            .get("fields", Map<string, Record<IField>>())
            .get(name, Field());

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
                return state.set(
                    formId,
                    form.set("fields", fields.remove(name))
                );
            } else {
                return state;
            }
        });
    };

    const FieldComponent = class Field<T = {}> extends React.PureComponent<
        IFieldProps<T>
    > {
        static defaultProps = defaultPropsField;

        constructor(props: IFieldProps<T>) {
            super(props);

            this.consumerRender = this.consumerRender.bind(this);
            this.onChange = this.onChange.bind(this);
            this.onBlur = this.onBlur.bind(this);
            this.onFocus = this.onFocus.bind(this);
        }
        consumerRender(state: IState) {
            const { name, formId, Component, getValue, ...props } = this
                    .props as any,
                field = selectField(state, formId, name),
                value = field.get("value", ""),
                errors = field.get("error", []);

            return React.createElement(Component, {
                ...props,
                error: errors.length !== 0,
                errors: errors,
                value: value,
                onChange: this.onChange,
                onBlur: this.onBlur,
                onFocus: this.onFocus
            });
        }
        onChange(
            e: React.ChangeEventHandler<
                HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
            >
        ) {
            const { name, formId, getValue } = this.props;

            validators[formId]();

            updateField(formId, name, field =>
                field.set("value", (getValue as any)(e))
            );
        }
        onBlur(
            e: React.FocusEventHandler<
                HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
            >
        ) {
            const { name, formId } = this.props;
            updateField(formId, name, field => field.set("focus", false));
        }
        onFocus(
            e: React.FocusEventHandler<
                HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
            >
        ) {
            const { name, formId } = this.props;
            updateField(formId, name, field => field.set("focus", true));
        }
        componentDidUpdate(prev: IFieldProps<T>) {
            const { name, formId } = this.props;

            if (name !== prev.name) {
                removeField(formId, prev.name);
            }
        }
        render() {
            return React.createElement(Consumer, null, this.consumerRender);
        }
    };

    const injectForm = <D>(options: IOptions<D>) => {
        const timeout = options.timeout || 300,
            changesetFn = options.changeset;

        return <P extends IInjectedFormProps>(
            Component: React.ComponentType<P>
        ): React.ComponentClass<
            Pick<P, Exclude<keyof P, keyof IInjectedFormProps>>
        > & { WrappedComponent: React.ComponentType<P> } => {
            return class Form extends React.PureComponent<P> {
                static displayName = `Form(${Component.displayName ||
                    Component.name ||
                    "Component"})`;

                formId: string;

                constructor(props: P) {
                    super(props);

                    this.formId = create(
                        (props as any).defaults,
                        changesetFn,
                        timeout
                    );
                    this.consumerRender = this.consumerRender.bind(this);
                    this.getForm = this.getForm.bind(this);
                    this.resetForm = this.resetForm.bind(this);
                }
                componentWillUnmount() {
                    remove(this.formId);
                }
                consumerRender(state: IState) {
                    return React.createElement(Component as any, {
                        ...(this.props as any),
                        valid: selectForm(state, this.formId).get(
                            "valid",
                            true
                        ),
                        resetForm: this.resetForm,
                        getForm: this.getForm,
                        formId: this.formId
                    });
                }
                resetForm() {
                    console.log((this.props as any).defaults);
                    resetForm(this.formId, (this.props as any).defaults || {});
                }
                getForm() {
                    return selectForm(store.state.getState(), this.formId)
                        .get("fields", Map())
                        .map(field => field.get("value", ""));
                }
                render() {
                    return React.createElement(
                        Consumer,
                        null,
                        this.consumerRender
                    );
                }
            } as any;
        };
    };

    return {
        create,
        remove,
        selectForm,
        selectField,
        updateField,
        removeField,
        store,
        injectForm,
        Field: FieldComponent
    };
};
