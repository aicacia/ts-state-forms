# ts-state-forms

[![license](https://img.shields.io/badge/license-MIT%2FApache--2.0-blue")](LICENSE-MIT)
[![docs](https://img.shields.io/badge/docs-typescript-blue.svg)](https://aicacia.github.io/ts-state-forms/)
[![npm (scoped)](https://img.shields.io/npm/v/@aicacia/state-forms)](https://www.npmjs.com/package/@aicacia/state-forms)
[![build](https://github.com/aicacia/ts-state-forms/workflows/Test/badge.svg)](https://github.com/aicacia/ts-state-forms/actions?query=workflow%3ATest)

use forms with @aicacia/state and @aicacia/state-react

## createFormsStore

```ts
// "./lib/stores/forms"
import { createForms } from "@aicacia/state-forms";
import { state, Consumer } from "../path/to/state";

export const {
  selectForm,
  selectFormExists,
  selectField,
  updateForm,
  selectErrors,
  selectFieldErrors,
  addFormError,
  addFieldError,
  updateField,
  changeField,
  removeField,
  forms,
  injectForm,
  useForm,
} = createForms(state, Consumer);
```

## Form

```tsx
// "./lib/components/Form"
import axios from "axios";
import { IInputProps, IInjectedFormProps } from "@aicacia/state-forms";
import { useForm } from "../path/to/forms";

interface ICustomInputProps extends IInputProps<string> {}

// create a component that can be used with Field Component
const CustomInput = (props: ICustomInputProps) => (
    <div>
        <input
            value={props.value}
            onChange={props.onChange}
            onBlur={props.onBlur}
            onFocus={props.onFocus}
        />
        {props.error && <ul>
        {
            props.errors.map({ message } => (
                <li>{message}</li>
            ))
        }
        </ul>}
    </div>
);

interface IFormValues {
    name: string;
    age: number;
}

interface IFormProps {
    defaults?: Partial<IFormValues>;
}

function Form(props: IFormProps) {
    const { Field } = useForm({
        defaults: props.defaults,
        changeset: changeset => changeset
            .validateLength("age", { ">=": 18 })
            .validateRequired(["name", "age"])
    });

    const onSubmit = (e: React.FormEvent) => {
        const { resetForm, getForm, addFormError } = this.props,
            values = getForm();

        e.preventDefault();

        // submit values to server
        axios
            .post("/form")
            .then(response => {
                // handle response, reset form
                resetForm();
            })
            .catch(response => {
                if (response.data && response.data.errors) {
                    // add errors with addFormError
                }
            });
    };

    return (
        <form onSubmit={this.onSubmit}>
            <Field name="name" Component={CustomInput} />
            <Field name="age" Component={CustomInput} />
            <input
                type="submit"
                onClick={this.onSubmit}
                disabled={valid}
                value="submit"
            />
        </form>
    );
}

React.render(<Form
    onFormChange={(props: IFormProps) => {
        console.log("any change", props);
    }}
    onFormChangeValid={(props: IFormProps) => {
        console.log("valid change");
    }}
    defaults={{ age: 18 }}
/>, document.getElementById("app"));
```
