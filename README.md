# js-state-forms

use forms with @aicacia/state and @aicacia/state-react

## createFormsStore

```ts
// "./lib/stores/forms"
import { state, Consumer } from "../path/to/state";

export const {
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
} = createFormsStore(state, Consumer);
```

## Form

```tsx
// "./lib/components/Form"
import axios from "axios";
import { IInputProps, IInjectedFormProps } from "@aicacia/state-forms";
import { injectForm } from "../path/to/forms";

interface ICustomInputProps extends IInputProps<string> {}

// create a component that can be used with Field Component
const CustomInput = ({
    value,
    error,
    errors,
    change,
    onChange,
    onBlur,
    onFocus
}: ICustomInputProps) => (
    <div>
        <input
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            onFocus={onFocus}
        />
        {error && <ul>
        {
            errors.map({ message } => (
                <li>{message}</li>
            ))
        }
        </ul>}
    </div>
);

interface IFormProps extends IInjectedFormProps {}

class Form extends React.PureComponent<IFormProps> {
    onFormChange = () => {
        console.log("any change");
    };
    onFormChangeValid = () => {
        console.log("valid change");
    };
    onSubmit = (e: React.FormEvent) => {
        const { resetForm, getForm, setErrors } = this.props,
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
                if (response.data) {
                    setErrors(response.data.errors);
                }
            });
    };
    render() {
        const { valid, Field } = this.props;

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
}

const ConnectedForm = injectForm({
    changeset: changeset => changeset
        .validateLength("age", { ">=": 13 })
        .validateRequired(["name", "age"])
})(Form);
```
